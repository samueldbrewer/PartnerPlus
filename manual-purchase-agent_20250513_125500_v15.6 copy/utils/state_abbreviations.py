"""
State name to abbreviation mapping for US states
"""

STATE_ABBREVIATIONS = {
    # US States
    "Alabama": "AL",
    "Alaska": "AK", 
    "Arizona": "AZ",
    "Arkansas": "AR",
    "California": "CA",
    "Colorado": "CO",
    "Connecticut": "CT",
    "Delaware": "DE",
    "Florida": "FL",
    "Georgia": "GA",
    "Hawaii": "HI",
    "Idaho": "ID",
    "Illinois": "IL",
    "Indiana": "IN",
    "Iowa": "IA",
    "Kansas": "KS",
    "Kentucky": "KY",
    "Louisiana": "LA",
    "Maine": "ME",
    "Maryland": "MD",
    "Massachusetts": "MA",
    "Michigan": "MI",
    "Minnesota": "MN",
    "Mississippi": "MS",
    "Missouri": "MO",
    "Montana": "MT",
    "Nebraska": "NE",
    "Nevada": "NV",
    "New Hampshire": "NH",
    "New Jersey": "NJ",
    "New Mexico": "NM",
    "New York": "NY",
    "North Carolina": "NC",
    "North Dakota": "ND",
    "Ohio": "OH",
    "Oklahoma": "OK",
    "Oregon": "OR",
    "Pennsylvania": "PA",
    "Rhode Island": "RI",
    "South Carolina": "SC",
    "South Dakota": "SD",
    "Tennessee": "TN",
    "Texas": "TX",
    "Utah": "UT",
    "Vermont": "VT",
    "Virginia": "VA",
    "Washington": "WA",
    "West Virginia": "WV",
    "Wisconsin": "WI",
    "Wyoming": "WY",
    # US Territories
    "District of Columbia": "DC",
    "Puerto Rico": "PR",
    "Virgin Islands": "VI",
    "Guam": "GU",
    "American Samoa": "AS",
    "Northern Mariana Islands": "MP"
}

# Create reverse mapping
ABBREVIATION_TO_STATE = {v: k for k, v in STATE_ABBREVIATIONS.items()}

def get_state_abbreviation(state_name):
    """
    Get state abbreviation from state name
    
    Args:
        state_name (str): Full state name (e.g., "California")
        
    Returns:
        str: State abbreviation (e.g., "CA") or original value if not found
    """
    if not state_name:
        return ""
    
    # If it's already an abbreviation (2 characters), return it
    if len(state_name) == 2 and state_name.upper() in ABBREVIATION_TO_STATE:
        return state_name.upper()
    
    # Try to find the state name (case-insensitive)
    state_name_clean = state_name.strip().title()
    return STATE_ABBREVIATIONS.get(state_name_clean, state_name[:2].upper())

def get_state_name(abbreviation):
    """
    Get state name from abbreviation
    
    Args:
        abbreviation (str): State abbreviation (e.g., "CA")
        
    Returns:
        str: Full state name (e.g., "California") or original value if not found
    """
    if not abbreviation:
        return ""
    
    abbreviation_upper = abbreviation.strip().upper()
    return ABBREVIATION_TO_STATE.get(abbreviation_upper, abbreviation)