'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { AccountPicker } from '@/components/common/account-picker';
import { PageHeader } from '@/components/common/page';
import { amountOrNull, inventoryItemFormSchema } from '@/lib/schemas/inventory.schema';
import { isVersionConflict } from '@/lib/services/api-client';
import { getCoaTree } from '@/lib/services/coa.service';
import { inventoryItemsService } from '@/lib/services/inventory.service';
import { taxCodesService } from '@/lib/services/settings-catalog.service';
import { toInputAmount } from '../coa/coa-tree';
import { BackButton, ErrorAlert, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { FormSkeleton, useIdempotencyKey, useLoad, withCurrentAccount } from '../banking/banking-parts';
import { BlockedForm } from '../banking/document-form';
import { accountsUnder } from '../sales/CatalogSettingsPage';
import { plainNumber } from '../sales/sales-documents';
import { NONE } from '../sales/sales-parts';
import { INVENTORY_TABS, recordLabel } from './inventory-documents';

const INCOME_ROOTS = ['income'];
const EXPENSE_ROOTS = ['expenses'];
const VALUATION_METHOD = 'Moving average';

function valuesFrom(item) {
  return {
    code: item?.code ?? '',
    name: item?.name ?? '',
    unit_name: item?.unit_name ?? '',
    qty_desired: plainNumber(item?.qty_desired),
    income_account_id: item?.income_account_id ?? '',
    expense_account_id: item?.expense_account_id ?? '',
    purchase_unit_price: toInputAmount(item?.purchase_unit_price),
    sales_unit_price: toInputAmount(item?.sales_unit_price),
    tax_code_id: item?.tax_code_id ?? '',
    description: item?.description ?? '',
    is_inactive: item?.is_inactive ?? false,
  };
}

// The create / update body; a blank account means the API default (Inventory - sales / Inventory - cost).
function bodyFrom(values, item) {
  const body = {
    name: values.name,
    code: values.code || null,
    unit_name: values.unit_name || null,
    description: values.description || null,
    qty_desired: amountOrNull(values.qty_desired),
    income_account_id: values.income_account_id || null,
    expense_account_id: values.expense_account_id || null,
    purchase_unit_price: amountOrNull(values.purchase_unit_price),
    sales_unit_price: amountOrNull(values.sales_unit_price),
    tax_code_id: values.tax_code_id || null,
  };
  return item ? { version: item.version, is_inactive: values.is_inactive, ...body } : body;
}

function useItemFormData(businessId, itemId) {
  return useLoad(async () => {
    const [tree, taxCodes, item] = await Promise.all([
      getCoaTree(businessId, todayIso()),
      taxCodesService.listAll(businessId),
      itemId ? inventoryItemsService.get(businessId, itemId) : null,
    ]);
    return {
      item,
      income: withCurrentAccount(accountsUnder(tree, INCOME_ROOTS), item?.income_account_id, item?.income_account_name),
      expense: withCurrentAccount(accountsUnder(tree, EXPENSE_ROOTS), item?.expense_account_id, item?.expense_account_name),
      taxCodes: withCurrentAccount(taxCodes.items.filter((code) => !code.is_inactive), item?.tax_code_id, item?.tax_code_name),
    };
  }, [businessId, itemId]);
}

function TextField({ control, name, label, disabled, inputClassName, ...props }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input className={inputClassName} disabled={disabled} {...props} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// options: [{ id, name, code? }]; '' (the "none" entry) is noneLabel.
function SelectField({ control, name, label, options, noneLabel, disabled }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value || NONE} onValueChange={(next) => field.onChange(next === NONE ? '' : next)} disabled={disabled}>
            <FormControl>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NONE}>{noneLabel}</SelectItem>
              {options.map((option) => <SelectItem key={option.id} value={option.id}>{recordLabel(option)}</SelectItem>)}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// An account field on the shared picker (names and head groups, no codes); '' is noneLabel.
function AccountFormField({ control, name, label, accounts, noneLabel, disabled }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <AccountPicker value={field.value} accounts={accounts} onChange={field.onChange} noneLabel={noneLabel} label={label} disabled={disabled} className="w-full" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ItemFields({ control, catalogs, isEdit, disabled }) {
  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      <TextField control={control} name="code" label="Item code" disabled={disabled} autoComplete="off" />
      <TextField control={control} name="name" label="Item name" disabled={disabled} autoComplete="off" />
      <TextField control={control} name="unit_name" label="Unit name" placeholder="e.g. pcs" disabled={disabled} autoComplete="off" />
      <div className="space-y-2">
        <Label htmlFor="inventory-item-valuation">Valuation method</Label>
        <Input id="inventory-item-valuation" value={VALUATION_METHOD} readOnly disabled />
      </div>
      <TextField control={control} name="qty_desired" label="Qty desired" inputMode="decimal" inputClassName="num" disabled={disabled} />
      <AccountFormField control={control} name="income_account_id" label="Custom income account" accounts={catalogs.income} noneLabel="Inventory - sales" disabled={disabled} />
      <AccountFormField control={control} name="expense_account_id" label="Custom expense account" accounts={catalogs.expense} noneLabel="Inventory - cost" disabled={disabled} />
      <TextField control={control} name="purchase_unit_price" label="Purchase unit price" inputMode="decimal" inputClassName="num" disabled={disabled} />
      <TextField control={control} name="sales_unit_price" label="Sales unit price" inputMode="decimal" inputClassName="num" disabled={disabled} />
      <SelectField control={control} name="tax_code_id" label="Tax code" options={catalogs.taxCodes} noneLabel="No tax" disabled={disabled} />
      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Description</FormLabel>
            <FormControl><Textarea rows={2} disabled={disabled} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {isEdit && (
        <FormField
          control={control}
          name="is_inactive"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3 space-y-0">
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={disabled} /></FormControl>
              <FormLabel className="font-normal">Inactive</FormLabel>
            </FormItem>
          )}
        />
      )}
    </div>
  );
}

function ItemForm({ businessId, loaded, onBack, onSaved, onReload }) {
  const { item } = loaded;
  const keyFor = useIdempotencyKey();
  const form = useForm({ resolver: zodResolver(inventoryItemFormSchema), defaultValues: valuesFrom(item) });
  const saving = form.formState.isSubmitting;
  const rootError = form.formState.errors.root;

  async function submit(values) {
    const body = bodyFrom(values, item);
    try {
      const saved = item
        ? await inventoryItemsService.update(businessId, item.id, body)
        : await inventoryItemsService.create(businessId, body, keyFor(JSON.stringify(body)));
      onSaved(saved.id);
    } catch (err) {
      form.setError('root', { message: err?.message ?? 'Failed to save the item.', type: isVersionConflict(err) ? 'conflict' : 'server' });
    }
  }

  const reloadAction = rootError?.type === 'conflict' && <Button variant="secondary" size="sm" onClick={onReload}>Reload</Button>;

  return (
    <div className="max-w-3xl">
      <PageHeader title={item ? 'Edit Inventory Item' : 'New Inventory Item'} back={<BackButton onClick={onBack} disabled={saving} />} />
      {rootError && <ErrorAlert action={reloadAction}>{rootError.message}</ErrorAlert>}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-8" noValidate>
          <ItemFields control={form.control} catalogs={loaded} isEdit={!!item} disabled={saving} />
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <Button type="submit" className="min-w-24" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : item ? 'Update' : 'Create'}
            </Button>
            <Button type="button" variant="ghost" onClick={onBack} disabled={saving}>Cancel</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

// ?tab=inventory-items&new=1 | &edit=<id>
export default function InventoryItemForm({ businessId, itemId = null, allowed }) {
  const navigate = useTabNavigate(INVENTORY_TABS.items);
  const data = useItemFormData(businessId, itemId);
  const back = () => navigate(itemId ? { view: itemId } : {});
  const title = itemId ? 'Edit Inventory Item' : 'New Inventory Item';

  if (!allowed) return <BlockedForm title={title} reason="You don't have access to this action." onBack={back} />;
  if (!data.data) return data.error ? <ErrorAlert>{data.error}</ErrorAlert> : <FormSkeleton fields={11} lines={0} />;
  return (
    <ItemForm
      key={data.data.item?.version ?? 'new'}
      businessId={businessId}
      loaded={data.data}
      onBack={back}
      onSaved={(id) => navigate({ view: id })}
      onReload={data.reload}
    />
  );
}
