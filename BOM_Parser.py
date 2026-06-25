import pandas as pd
import sys

def parse_bom(file_path: str) -> list[dict]:
    """
    Parse a BOM Excel/CSV file and return a list of components.
    Handles any number of columns - always takes first 3 (MPN, Description, Quantity).
    Uses itertuples for 10x faster iteration vs iterrows.
    """
    # Read file
    if file_path.endswith('.csv'):
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)

    print(f"Columns found: {list(df.columns)}")

    # Always take first 3 columns regardless of header names
    df = df.iloc[:, :3].copy()
    df.columns = ['MPN', 'Description', 'Quantity']

    # Clean data
    df = df.dropna(subset=['MPN'])
    df = df[df['MPN'].astype(str).str.strip() != '']
    df = df[df['MPN'].astype(str).str.lower() != 'nan']
    df['Quantity'] = pd.to_numeric(df['Quantity'], errors='coerce').fillna(1).astype(int)

    print(f"Total components: {len(df)}")
    print("\n--- BOM Components ---")

    components = []

    # itertuples is 10x faster than iterrows
    for row in df.itertuples(index=False):
        desc = str(row.Description or '').strip()
        component = {
            "MPN"        : str(row.MPN).strip(),
            "Description": desc,
            "Quantity"   : int(row.Quantity)
        }
        components.append(component)
        print(f"MPN: {row.MPN} | Qty: {row.Quantity} | {desc[:50]}")

    return components


if __name__ == "__main__":
    file = sys.argv[1] if len(sys.argv) > 1 else "MIDI_1.xlsx"
    parse_bom(file)