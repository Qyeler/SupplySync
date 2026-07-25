# SupplySync

SupplySync is an operations workspace for HoReCa purchasing teams. The current
vertical slice covers the purchasing loop: maintain products, supplier price
offers and minimums, create requests from the live catalog, and move requests
through the delivery workflow.

## Included

- Purchase request dashboard with search, workflow filters and status changes.
- One-click operational queues for overdue deliveries, today's arrivals and discrepancies.
- Detailed request cards with immutable status history and receipt context.
- Controlled cancellations with required reasons recorded in the status timeline.
- Repeat purchasing from prior requests with current prices, minimums and lead times.
- Draft request editing with refreshed catalog prices and immutable sent orders.
- Editable product catalog with SKU, categories, supplier offers and preferred sources.
- Reversible product archiving with draft-order protection.
- Editable supplier directory with contacts, lead times, assortment and open-order totals.
- Reversible supplier archiving with open-order and new-purchase protection.
- Delivery-date guardrails driven by each supplier's current lead time.
- Server-owned price snapshots and minimum-order validation.
- Delivery receipt workflow with accepted quantities, rejections and discrepancies.
- Reversible discrepancy resolution with required notes and an audit trail.
- PostgreSQL schema managed by Alembic with idempotent demo data.

## Run locally

Requirements: Docker Desktop with Docker Compose.

```powershell
docker compose up --build
```

Open:

- App: http://localhost:5173
- API docs: http://localhost:8000/docs
- API health: http://localhost:8000/api/health

The Compose stack runs the initial Alembic migration and loads idempotent demo
data when the backend container starts. PostgreSQL is exposed on local port
`5433`.

## Checks

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
.\.venv\Scripts\python.exe -m pytest

cd ..\frontend
pnpm install --frozen-lockfile
pnpm build
```
