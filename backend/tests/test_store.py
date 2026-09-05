from pathlib import Path

from backend.data import store


def test_store_data_dir_is_project_local():
    assert store.DATA_DIR == Path(store.__file__).resolve().parents[2] / "data"
