"""Customers endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_role
from app.schemas.request.customer import CustomerCreate, CustomerUpdate
from app.schemas.response.customer import CustomerListResponse, CustomerResponse
from app.services.customer_service import CustomerService

router = APIRouter(
    prefix="/businesses/{business_id}/customers",
    tags=["Customers"],
)

_ROLE_DEP = [Depends(require_role("admin", "super_admin"))]


@router.get("", response_model=CustomerListResponse, dependencies=_ROLE_DEP)
async def list_customers(
    business_id: str,
    db: AsyncSession = Depends(get_db),
) -> CustomerListResponse:
    return await CustomerService(db).list_customers(business_id)


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED, dependencies=_ROLE_DEP)
async def create_customer(
    business_id: str,
    body: CustomerCreate,
    db: AsyncSession = Depends(get_db),
) -> CustomerResponse:
    return await CustomerService(db).create_customer(
        business_id=business_id,
        name=body.name,
        code=body.code,
        billing_address=body.billing_address,
        delivery_address=body.delivery_address,
        email=body.email,
    )


@router.get("/{customer_id}", response_model=CustomerResponse, dependencies=_ROLE_DEP)
async def get_customer(
    business_id: str,
    customer_id: str,
    db: AsyncSession = Depends(get_db),
) -> CustomerResponse:
    return await CustomerService(db).get_customer(business_id, customer_id)


@router.put("/{customer_id}", response_model=CustomerResponse, dependencies=_ROLE_DEP)
async def update_customer(
    business_id: str,
    customer_id: str,
    body: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
) -> CustomerResponse:
    fields = {k: v for k, v in body.model_dump().items() if k in body.model_fields_set}
    return await CustomerService(db).update_customer(
        business_id=business_id,
        customer_id=customer_id,
        fields=fields,
    )


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=_ROLE_DEP)
async def delete_customer(
    business_id: str,
    customer_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    await CustomerService(db).delete_customer(business_id, customer_id)
