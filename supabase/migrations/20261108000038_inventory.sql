-- ==============================================
-- Migration: inventory (B6; domain-model §1a, §5.5; posting-rules PR-23, PR-26, PR-29, PR-37, PR-39,
-- PR-42, PR-44..PR-47, PR-62, PR-69; BV-01, BV-02; CD-16, CD-17)
-- Date: 2026-11-08
--
-- * Reference: valuation_methods (moving_average enabled; fifo listed, not enabled, BV-01).
-- * inventory_items (1:1 extension of items kind 'inventory': valuation method, qty desired; the
--   item's income / expense accounts are its custom Inventory - sales / Inventory - cost accounts,
--   NULL = the system account). kit_components (items kind 'kit' -> inventory components).
-- * inventory_locations: one default location per business ("Default Inventory Location"),
--   seeded for every existing business and by a trigger on new businesses.
-- * trade_documents.location_id (NULL = the default location): where a delivery note, goods receipt
--   or an invoice / note that acts as one moves stock.
-- * stock_documents + stock_document_lines (inventory transfers, write-offs, production orders) and
--   production_orders (finished item + qty; BOM and capitalised-cost lines are stock_document_lines).
-- * stock_movements: one row per document line and location: qty_owned (valued, moves the
--   Inventory on hand account), qty_on_hand (physical), amount = signed value of the owned qty.
--   Moving average per item = sum(amount) / sum(qty_owned) in document-date order (BV-01).
--   Rows are replaced when their document is reposted and deleted when it is voided.
-- * inventory_cost_corrections: the audited log of COGS entries re-posted after a back-dated
--   change (PR-69).
-- * opening_balances kind inventory_item (+ item_id), PR-62.
-- * Areas inventory_locations, inventory_kits; document types inventory_transfer,
--   inventory_write_off, production_order; inventory tabs on by default.
-- * No allow_negative_stock setting: negative stock is always rejected (CD-16).
--
-- ROLLBACK (run manually, newest first):
--   DROP TABLE public.inventory_cost_corrections, public.stock_movements, public.production_orders,
--     public.stock_document_lines, public.stock_documents, public.kit_components, public.inventory_items,
--     public.valuation_methods;
--   ALTER TABLE public.trade_documents DROP COLUMN location_id;
--   ALTER TABLE public.opening_balances DROP COLUMN item_id (restore the CHECK and opening_balances_one_live()
--     from 20261108000037 / 20261108000034); DELETE kind inventory_item;
--   DROP TRIGGER businesses_create_default_location ON public.businesses;
--   DROP FUNCTION public.create_business_default_location(); DROP TABLE public.inventory_locations;
--   DELETE the B6 document_type_areas, document_types, access_preset_rights and areas rows;
--   UPDATE public.admin_tabs SET default_enabled = false WHERE key IN ('inventory-items',
--     'inventory-transfers', 'inventory-write-offs', 'production-orders');
--   restore the select / write policies of items, tax_codes, coa_accounts from 20261108000037 / 20261108000034.
-- ==============================================

BEGIN;

-- 1. Reference data
CREATE TABLE public.valuation_methods (
    key        TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name       TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL
);
INSERT INTO public.valuation_methods (key, name, is_enabled) VALUES
    ('moving_average', 'Moving average', true), ('fifo', 'First in, first out', false);

-- 2. Areas, document types, opening kind
INSERT INTO public.areas (key, label, module_id, tab_key, is_owner_only, is_view_only, sort_order)
SELECT v.key, v.label, m.id, NULL, false, false, v.sort_order
FROM (VALUES
    ('inventory_locations', 'Inventory locations', 'inventory', 74),
    ('inventory_kits', 'Inventory kits', 'inventory', 75)
) AS v(key, label, module_key, sort_order)
JOIN public.modules m ON m.key = v.module_key
ON CONFLICT (key) DO NOTHING;
-- new area inventory_locations / inventory_kits: custom members have no rights until granted; owners/full members see it immediately

INSERT INTO public.access_preset_rights (preset_id, area_key, right_key)
SELECT p.id, a.area_key, r.right_key
FROM public.access_presets p
CROSS JOIN (VALUES ('inventory_locations'), ('inventory_kits')) AS a(area_key)
JOIN LATERAL (VALUES ('view'), ('create'), ('edit'), ('delete')) AS r(right_key)
    ON p.key = 'accountant' OR (p.key = 'view_only' AND r.right_key = 'view')
       OR (p.key = 'bookkeeper' AND r.right_key <> 'delete')
ON CONFLICT DO NOTHING;

INSERT INTO public.document_types (key, name) VALUES
    ('inventory_transfer', 'Inventory transfer'), ('inventory_write_off', 'Inventory write-off'),
    ('production_order', 'Production order');
INSERT INTO public.document_type_areas (document_type_id, area_key)
SELECT t.id, v.area_key
FROM (VALUES ('inventory_transfer', 'inventory_transfers'), ('inventory_write_off', 'inventory_write_offs'),
             ('production_order', 'production_orders')) AS v(type_key, area_key)
JOIN public.document_types t ON t.key = v.type_key;

INSERT INTO public.opening_balance_kinds (key, name) VALUES ('inventory_item', 'Inventory item');

-- 3. Inventory items (1:1 extension) and kit components
CREATE TABLE public.inventory_items (
    item_id              UUID PRIMARY KEY,
    business_id          UUID NOT NULL,
    valuation_method_key TEXT NOT NULL DEFAULT 'moving_average'
        REFERENCES public.valuation_methods(key) ON DELETE RESTRICT,
    qty_desired          NUMERIC(19,4) NULL CHECK (qty_desired >= 0),
    CONSTRAINT inventory_items_business_id_item_id_key UNIQUE (business_id, item_id),
    CONSTRAINT inventory_items_item_fkey FOREIGN KEY (business_id, item_id)
        REFERENCES public.items(business_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_inventory_items_valuation_method ON public.inventory_items (valuation_method_key);

CREATE TABLE public.kit_components (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id       UUID NOT NULL,
    kit_item_id       UUID NOT NULL,
    component_item_id UUID NOT NULL,
    line_no           INTEGER NOT NULL CHECK (line_no >= 1),
    qty               NUMERIC(19,4) NOT NULL CHECK (qty > 0),
    CONSTRAINT kit_components_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT kit_components_kit_fkey FOREIGN KEY (business_id, kit_item_id)
        REFERENCES public.items(business_id, id) ON DELETE CASCADE,
    CONSTRAINT kit_components_component_fkey FOREIGN KEY (business_id, component_item_id)
        REFERENCES public.inventory_items(business_id, item_id) ON DELETE RESTRICT,
    CONSTRAINT kit_components_pair_key UNIQUE (kit_item_id, component_item_id),
    CONSTRAINT kit_components_line_no_key UNIQUE (kit_item_id, line_no)
);
CREATE INDEX idx_kit_components_kit ON public.kit_components (business_id, kit_item_id);
CREATE INDEX idx_kit_components_component ON public.kit_components (business_id, component_item_id);

-- 4. Locations (one default per business)
CREATE TABLE public.inventory_locations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    code        TEXT NULL CHECK (char_length(code) BETWEEN 1 AND 50),
    is_default  BOOLEAN NOT NULL DEFAULT false,
    version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inventory_locations_business_id_id_key UNIQUE (business_id, id)
);
CREATE UNIQUE INDEX uq_inventory_locations_default ON public.inventory_locations (business_id) WHERE is_default;
CREATE UNIQUE INDEX uq_inventory_locations_name ON public.inventory_locations (business_id, lower(name));
CREATE TRIGGER set_updated_at_inventory_locations BEFORE UPDATE ON public.inventory_locations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.create_business_default_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.inventory_locations (business_id, name, is_default)
    VALUES (NEW.id, 'Default Inventory Location', true);
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_business_default_location() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER businesses_create_default_location
    AFTER INSERT ON public.businesses
    FOR EACH ROW EXECUTE FUNCTION public.create_business_default_location();
INSERT INTO public.inventory_locations (business_id, name, is_default)
SELECT b.id, 'Default Inventory Location', true FROM public.businesses b;

-- 5. Where trade documents move stock (NULL = the default location)
ALTER TABLE public.trade_documents
    ADD COLUMN location_id UUID NULL,
    ADD CONSTRAINT trade_documents_location_fkey FOREIGN KEY (business_id, location_id)
        REFERENCES public.inventory_locations(business_id, id) ON DELETE RESTRICT;
CREATE INDEX idx_trade_documents_location ON public.trade_documents (business_id, location_id)
    WHERE location_id IS NOT NULL;

-- 6. Stock documents: transfers, write-offs, production orders
CREATE TABLE public.stock_documents (
    document_id    UUID PRIMARY KEY,
    business_id    UUID NOT NULL,
    location_id    UUID NOT NULL,  -- transfers: from; write-offs and production: the location
    to_location_id UUID NULL,      -- transfers only
    CONSTRAINT stock_documents_business_id_id_key UNIQUE (business_id, document_id),
    CONSTRAINT stock_documents_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_documents_location_fkey FOREIGN KEY (business_id, location_id)
        REFERENCES public.inventory_locations(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_documents_to_location_fkey FOREIGN KEY (business_id, to_location_id)
        REFERENCES public.inventory_locations(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_documents_distinct_locations CHECK (to_location_id IS DISTINCT FROM location_id)
);
CREATE INDEX idx_stock_documents_location ON public.stock_documents (business_id, location_id);
CREATE INDEX idx_stock_documents_to_location ON public.stock_documents (business_id, to_location_id)
    WHERE to_location_id IS NOT NULL;

-- Item lines (item + qty; a write-off line may name its account, NULL = Inventory write-offs) or,
-- on production orders, capitalised non-inventory cost lines (account + amount).
CREATE TABLE public.stock_document_lines (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id UUID NOT NULL,
    document_id UUID NOT NULL,
    line_no     INTEGER NOT NULL CHECK (line_no >= 1),
    item_id     UUID NULL,
    qty         NUMERIC(19,4) NULL CHECK (qty > 0),
    account_id  UUID NULL,
    amount      NUMERIC(19,4) NULL CHECK (amount > 0),
    description TEXT NULL CHECK (char_length(description) <= 2000),
    CONSTRAINT stock_document_lines_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT stock_document_lines_document_line_no_key UNIQUE (document_id, line_no),
    CONSTRAINT stock_document_lines_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.stock_documents(business_id, document_id) ON DELETE RESTRICT,
    CONSTRAINT stock_document_lines_item_fkey FOREIGN KEY (business_id, item_id)
        REFERENCES public.inventory_items(business_id, item_id) ON DELETE RESTRICT,
    CONSTRAINT stock_document_lines_account_fkey FOREIGN KEY (business_id, account_id)
        REFERENCES public.coa_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_document_lines_shape CHECK (
        (item_id IS NOT NULL AND qty IS NOT NULL AND amount IS NULL)
        OR (item_id IS NULL AND qty IS NULL AND account_id IS NOT NULL AND amount IS NOT NULL))
);
CREATE INDEX idx_stock_document_lines_document ON public.stock_document_lines (business_id, document_id);
CREATE INDEX idx_stock_document_lines_item ON public.stock_document_lines (business_id, item_id)
    WHERE item_id IS NOT NULL;
CREATE INDEX idx_stock_document_lines_account ON public.stock_document_lines (business_id, account_id)
    WHERE account_id IS NOT NULL;

CREATE TABLE public.production_orders (
    document_id      UUID PRIMARY KEY,
    business_id      UUID NOT NULL,
    finished_item_id UUID NOT NULL,
    qty              NUMERIC(19,4) NOT NULL CHECK (qty > 0),
    CONSTRAINT production_orders_business_id_id_key UNIQUE (business_id, document_id),
    CONSTRAINT production_orders_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.stock_documents(business_id, document_id) ON DELETE RESTRICT,
    CONSTRAINT production_orders_finished_item_fkey FOREIGN KEY (business_id, finished_item_id)
        REFERENCES public.inventory_items(business_id, item_id) ON DELETE RESTRICT
);
CREATE INDEX idx_production_orders_finished_item ON public.production_orders (business_id, finished_item_id);

-- 7. Stock movements (the item's movement date is its document's date, §7: not copied)
CREATE TABLE public.stock_movements (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id UUID NOT NULL,
    document_id UUID NOT NULL,
    item_id     UUID NOT NULL,
    location_id UUID NOT NULL,
    line_no     INTEGER NOT NULL CHECK (line_no >= 1),  -- the document line that caused it
    qty_owned   NUMERIC(19,4) NOT NULL DEFAULT 0,
    qty_on_hand NUMERIC(19,4) NOT NULL DEFAULT 0,
    amount      NUMERIC(19,4) NOT NULL DEFAULT 0,  -- signed value of qty_owned (Inventory on hand)
    CONSTRAINT stock_movements_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT stock_movements_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_movements_item_fkey FOREIGN KEY (business_id, item_id)
        REFERENCES public.inventory_items(business_id, item_id) ON DELETE RESTRICT,
    CONSTRAINT stock_movements_location_fkey FOREIGN KEY (business_id, location_id)
        REFERENCES public.inventory_locations(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_movements_moves CHECK (qty_owned <> 0 OR qty_on_hand <> 0),
    CONSTRAINT stock_movements_value_needs_owned CHECK (qty_owned <> 0 OR amount = 0)
);
CREATE INDEX idx_stock_movements_item ON public.stock_movements (business_id, item_id);
CREATE INDEX idx_stock_movements_document ON public.stock_movements (business_id, document_id);
CREATE INDEX idx_stock_movements_location ON public.stock_movements (business_id, location_id);

-- 8. Cost corrections (PR-69): a later document whose COGS was re-posted because of a back-dated change
CREATE TABLE public.inventory_cost_corrections (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id           UUID NOT NULL,
    document_id           UUID NOT NULL,
    caused_by_document_id UUID NOT NULL,
    old_amount            NUMERIC(19,4) NOT NULL,
    new_amount            NUMERIC(19,4) NOT NULL,
    created_by            UUID NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inventory_cost_corrections_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT inventory_cost_corrections_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT inventory_cost_corrections_cause_fkey FOREIGN KEY (business_id, caused_by_document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_inventory_cost_corrections_business ON public.inventory_cost_corrections (business_id, created_at);
CREATE INDEX idx_inventory_cost_corrections_document ON public.inventory_cost_corrections (business_id, document_id);
CREATE INDEX idx_inventory_cost_corrections_cause ON public.inventory_cost_corrections (business_id, caused_by_document_id);

-- 9. Inventory starting balances (PR-62): quantities and value are the opening document's stock movements
ALTER TABLE public.opening_balances
    ADD COLUMN item_id UUID NULL,
    ADD CONSTRAINT opening_balances_item_fkey FOREIGN KEY (business_id, item_id)
        REFERENCES public.inventory_items(business_id, item_id) ON DELETE RESTRICT,
    DROP CONSTRAINT opening_balances_source_matches_kind,
    ADD CONSTRAINT opening_balances_source_matches_kind CHECK (
        (kind_key = 'account') = (account_id IS NOT NULL)
        AND (kind_key = 'bank_account') = (bank_account_id IS NOT NULL)
        AND (kind_key = 'inventory_item') = (item_id IS NOT NULL)
        AND (kind_key IN ('sales_invoice', 'purchase_invoice')) = (invoice_document_id IS NOT NULL)
        AND (kind_key IN ('sales_invoice', 'purchase_invoice')) = (paid_before_start IS NOT NULL));
CREATE INDEX idx_opening_balances_business_item ON public.opening_balances (business_id, item_id)
    WHERE item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.opening_balances_one_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text || ':' || COALESCE(
        NEW.account_id, NEW.bank_account_id, NEW.invoice_document_id, NEW.item_id)::text, 0));
    IF EXISTS (
        SELECT 1 FROM public.opening_balances o
        JOIN public.documents d ON d.business_id = o.business_id AND d.id = o.document_id
        JOIN public.document_statuses s ON s.id = d.status_id
        WHERE o.business_id = NEW.business_id
          AND o.account_id IS NOT DISTINCT FROM NEW.account_id
          AND o.bank_account_id IS NOT DISTINCT FROM NEW.bank_account_id
          AND o.invoice_document_id IS NOT DISTINCT FROM NEW.invoice_document_id
          AND o.item_id IS NOT DISTINCT FROM NEW.item_id
          AND o.document_id <> NEW.document_id AND s.key <> 'void'
    ) THEN
        RAISE EXCEPTION 'This record already has a starting balance' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- 10. Lock date on the typed child rows (PR-75; descriptions stay editable)
CREATE TRIGGER stock_documents_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.stock_documents
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard();
CREATE TRIGGER stock_document_lines_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.stock_document_lines
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard('description');
CREATE TRIGGER production_orders_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.production_orders
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard();
CREATE TRIGGER stock_movements_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.stock_movements
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard();

-- 11. Privileges and RLS
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['valuation_methods', 'inventory_items', 'kit_components', 'inventory_locations',
                             'stock_documents', 'stock_document_lines', 'production_orders', 'stock_movements',
                             'inventory_cost_corrections'] LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
        EXECUTE format('CREATE POLICY %I ON public.%I TO service_role USING (true) WITH CHECK (true)',
                       t || '_service_role_all', t);
    END LOOP;
END
$$;
GRANT SELECT ON public.valuation_methods TO bookvault_api, bookvault_rls_owner;
CREATE POLICY valuation_methods_api_select ON public.valuation_methods FOR SELECT TO bookvault_api USING (true);

-- Areas whose forms pick items, locations and accounts (one list, used by several policies below).
CREATE TEMP TABLE b6_picker_areas (area_key text) ON COMMIT DROP;
INSERT INTO b6_picker_areas VALUES
    ('inventory_items'), ('inventory_kits'), ('inventory_locations'), ('inventory_transfers'),
    ('inventory_write_offs'), ('production_orders'), ('non_inventory_items'), ('sales_quotes'), ('sales_orders'),
    ('sales_invoices'), ('credit_notes'), ('delivery_notes'), ('purchase_quotes'), ('purchase_orders'),
    ('purchase_invoices'), ('debit_notes'), ('goods_receipts'), ('settings.starting_balances'), ('reports');

DO $$
DECLARE
    v_any text;
BEGIN
    SELECT string_agg(format('public.has_area_access(business_id, %L, ''view'')', area_key), ' OR ')
    INTO v_any FROM b6_picker_areas;

    -- Items (every kind) and their inventory extension / kit components: readable from every picker area;
    -- written by the area of the item's kind.
    DROP POLICY items_api_select ON public.items;
    EXECUTE format('CREATE POLICY items_api_select ON public.items FOR SELECT TO bookvault_api '
                   'USING (public.is_business_member(business_id) AND (%s))', v_any);
    EXECUTE format('CREATE POLICY inventory_items_api_select ON public.inventory_items FOR SELECT TO bookvault_api '
                   'USING (public.is_business_member(business_id) AND (%s))', v_any);
    EXECUTE format('CREATE POLICY kit_components_api_select ON public.kit_components FOR SELECT TO bookvault_api '
                   'USING (public.is_business_member(business_id) AND (%s))', v_any);
    EXECUTE format('CREATE POLICY inventory_locations_api_select ON public.inventory_locations FOR SELECT '
                   'TO bookvault_api USING (public.is_business_member(business_id) AND (%s))', v_any);
END
$$;

-- The area that owns an item row, by kind.
DROP POLICY items_api_insert ON public.items;
DROP POLICY items_api_update ON public.items;
DROP POLICY items_api_delete ON public.items;
CREATE POLICY items_api_insert ON public.items FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_access(business_id, CASE item_kind_key WHEN 'inventory' THEN 'inventory_items'
                    WHEN 'kit' THEN 'inventory_kits' ELSE 'non_inventory_items' END, 'create'));
CREATE POLICY items_api_update ON public.items FOR UPDATE TO bookvault_api
    USING (public.has_area_access(business_id, CASE item_kind_key WHEN 'inventory' THEN 'inventory_items'
               WHEN 'kit' THEN 'inventory_kits' ELSE 'non_inventory_items' END, 'edit'))
    WITH CHECK (public.has_area_access(business_id, CASE item_kind_key WHEN 'inventory' THEN 'inventory_items'
                    WHEN 'kit' THEN 'inventory_kits' ELSE 'non_inventory_items' END, 'edit'));
CREATE POLICY items_api_delete ON public.items FOR DELETE TO bookvault_api
    USING (public.has_area_access(business_id, CASE item_kind_key WHEN 'inventory' THEN 'inventory_items'
               WHEN 'kit' THEN 'inventory_kits' ELSE 'non_inventory_items' END, 'delete'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items, public.kit_components, public.inventory_locations
    TO bookvault_api;
DO $$
DECLARE
    v record;
BEGIN
    FOR v IN SELECT * FROM (VALUES ('inventory_items', 'inventory_items'), ('kit_components', 'inventory_kits'),
                                   ('inventory_locations', 'inventory_locations')) AS x(t, area) LOOP
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO bookvault_api WITH CHECK ('
                       'public.has_area_access(business_id, %L, ''create'') OR public.has_area_access(business_id, %L, ''edit''))',
                       v.t || '_api_insert', v.t, v.area, v.area);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO bookvault_api USING ('
                       'public.has_area_access(business_id, %L, ''edit'')) WITH CHECK ('
                       'public.has_area_access(business_id, %L, ''edit''))', v.t || '_api_update', v.t, v.area, v.area);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO bookvault_api USING ('
                       'public.has_area_access(business_id, %L, ''delete'') OR public.has_area_access(business_id, %L, ''edit''))',
                       v.t || '_api_delete', v.t, v.area, v.area);
    END LOOP;
END
$$;

-- Typed children of a stock document inherit its area (B0.4 shared-ledger pattern); lines are
-- replaced while a document is edited, the extensions are kept on void.
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['stock_documents', 'stock_document_lines', 'production_orders'] LOOP
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO bookvault_api USING ('
            'public.is_business_member(business_id) AND (public.has_area_access(business_id, '
            'public.document_area_key(business_id, document_id), ''view'') '
            'OR public.has_area_access(business_id, ''reports'', ''view'')))', t || '_api_select', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO bookvault_api WITH CHECK ('
            'public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)))',
            t || '_api_insert', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO bookvault_api USING ('
            'public.has_area_write_access(business_id, public.document_area_key(business_id, document_id))) '
            'WITH CHECK (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)))',
            t || '_api_update', t);
    END LOOP;
END
$$;
GRANT SELECT, INSERT, UPDATE ON public.stock_documents, public.production_orders TO bookvault_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_document_lines TO bookvault_api;
CREATE POLICY stock_document_lines_api_delete ON public.stock_document_lines FOR DELETE TO bookvault_api
    USING (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)));

-- Stock movements: readable from the document's area, the inventory items list and reports; written
-- with their document (replaced on repost, deleted on void, amounts re-costed, PR-69).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO bookvault_api;
CREATE POLICY stock_movements_api_select ON public.stock_movements FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, public.document_area_key(business_id, document_id), 'view')
                OR public.has_area_access(business_id, 'inventory_items', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
CREATE POLICY stock_movements_api_insert ON public.stock_movements FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)));
CREATE POLICY stock_movements_api_update ON public.stock_movements FOR UPDATE TO bookvault_api
    USING (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)))
    WITH CHECK (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)));
CREATE POLICY stock_movements_api_delete ON public.stock_movements FOR DELETE TO bookvault_api
    USING (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)));

GRANT SELECT, INSERT ON public.inventory_cost_corrections TO bookvault_api;
CREATE POLICY inventory_cost_corrections_api_select ON public.inventory_cost_corrections FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'inventory_items', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
CREATE POLICY inventory_cost_corrections_api_insert ON public.inventory_cost_corrections FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_write_access(business_id,
                    public.document_area_key(business_id, caused_by_document_id)));

-- Pickers: accounts and tax codes are readable from the inventory areas too.
DO $$
DECLARE
    v_any text;
BEGIN
    SELECT string_agg(format('public.has_area_access(business_id, %L, ''view'')', area_key), ' OR ')
    INTO v_any FROM (VALUES ('settings.chart_of_accounts'), ('receipts'), ('payments'), ('inter_account_transfers'),
                            ('journal_entries'), ('late_payment_fees'), ('settings.tax_codes')) AS x(area_key);
    SELECT v_any || ' OR ' || string_agg(format('public.has_area_access(business_id, %L, ''view'')', area_key), ' OR ')
    INTO v_any FROM b6_picker_areas;
    DROP POLICY coa_accounts_api_select ON public.coa_accounts;
    EXECUTE format('CREATE POLICY coa_accounts_api_select ON public.coa_accounts FOR SELECT TO bookvault_api '
                   'USING (public.is_business_member(business_id) AND (%s))', v_any);
    DROP POLICY tax_codes_api_select ON public.tax_codes;
    EXECUTE format('CREATE POLICY tax_codes_api_select ON public.tax_codes FOR SELECT TO bookvault_api '
                   'USING (public.is_business_member(business_id) AND (%s))', v_any);
END
$$;

GRANT SELECT ON public.inventory_items, public.kit_components, public.inventory_locations, public.stock_documents,
    public.stock_document_lines, public.production_orders, public.stock_movements TO bookvault_rls_owner;

-- 12. Inventory tabs on by default for new businesses (build-plan B6)
UPDATE public.admin_tabs SET default_enabled = true
WHERE key IN ('inventory-items', 'inventory-transfers', 'inventory-write-offs', 'production-orders');

COMMIT;
