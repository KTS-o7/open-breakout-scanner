.PHONY: install backend frontend dev test snapshot update

install:
	python -m venv .venv
	. .venv/bin/activate && pip install -r backend/requirements.txt
	cd frontend && npm install

update:
	. .venv/bin/activate && python -m backend.data.update --days 7

snapshot:
	. .venv/bin/activate && python -m backend.compute.snapshot

backfill:
	. .venv/bin/activate && python -m backend.data.update --days 365

backend:
	. .venv/bin/activate && python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

frontend:
	cd frontend && npm run dev

dev:
	@echo "Run 'make backend' and 'make frontend' in two terminals"

test:
	. .venv/bin/activate && pytest backend/tests -v
