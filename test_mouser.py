from Mouser_fetch import _get_session
import os, json
from dotenv import load_dotenv
load_dotenv()

r = _get_session().post(
    'https://api.mouser.com/api/v1/search/partnumber?apiKey=' + os.getenv('MOUSER_API_KEY'),
    json={'SearchByPartRequest': {'mouserPartNumber': 'CC0603KRX7R9BB104', 'partSearchOptions': 'string'}},
    headers={'Content-Type': 'application/json'},
    timeout=8
)
parts = r.json().get('SearchResults', {}).get('Parts', [])
if parts:
    print(json.dumps(parts[0], indent=2))