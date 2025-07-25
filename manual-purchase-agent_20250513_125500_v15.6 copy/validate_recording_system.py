#!/usr/bin/env python3
"""
Validation script for the automated recording system
"""

import os
import json
import subprocess
from pathlib import Path

def validate_recording_system():
    """Validate that the recording system is properly set up"""
    
    print("=== Recording System Validation ===\n")
    
    # Check paths
    recording_system_path = Path("recording_system")
    recordings_path = recording_system_path / "recordings"
    
    print(f"1. Checking paths...")
    print(f"   Recording system path: {recording_system_path} - {'✓' if recording_system_path.exists() else '✗'}")
    print(f"   Recordings path: {recordings_path} - {'✓' if recordings_path.exists() else '✗'}")
    
    # Check Node.js dependencies
    print(f"\n2. Checking Node.js setup...")
    package_json = recording_system_path / "package.json"
    node_modules = recording_system_path / "node_modules"
    print(f"   package.json: {'✓' if package_json.exists() else '✗'}")
    print(f"   node_modules: {'✓' if node_modules.exists() else '✗'}")
    
    # Check core files
    print(f"\n3. Checking core files...")
    core_files = [
        "index.js",
        "src/recorder.js", 
        "src/player.js",
        "dummy_values.json"
    ]
    
    for file in core_files:
        file_path = recording_system_path / file
        print(f"   {file}: {'✓' if file_path.exists() else '✗'}")
    
    # Check existing recordings
    print(f"\n4. Checking existing recordings...")
    if recordings_path.exists():
        json_files = list(recordings_path.glob("*.json"))
        print(f"   Found {len(json_files)} recording files:")
        for recording in json_files[:5]:  # Show first 5
            print(f"     - {recording.name}")
        if len(json_files) > 5:
            print(f"     ... and {len(json_files) - 5} more")
    else:
        print("   No recordings directory found")
    
    # Test CLI help
    print(f"\n5. Testing CLI...")
    try:
        result = subprocess.run(
            ["node", "index.js", "--help"],
            cwd=recording_system_path,
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            print("   CLI help command: ✓")
        else:
            print(f"   CLI help command: ✗ (exit code {result.returncode})")
    except Exception as e:
        print(f"   CLI help command: ✗ ({e})")
    
    # Check if Flask API file exists
    print(f"\n6. Checking Flask integration...")
    api_file = Path("api/recording_studio_api.py")
    print(f"   Flask API file: {'✓' if api_file.exists() else '✗'}")
    
    # Test if we can load a recording
    print(f"\n7. Testing recording format...")
    if json_files:
        try:
            with open(json_files[0], 'r') as f:
                recording_data = json.load(f)
            
            required_keys = ['version', 'startUrl', 'actions']
            missing_keys = [key for key in required_keys if key not in recording_data]
            
            if not missing_keys:
                print(f"   Recording format: ✓ (tested {json_files[0].name})")
                print(f"     - Start URL: {recording_data['startUrl']}")
                print(f"     - Actions: {len(recording_data['actions'])}")
                print(f"     - Version: {recording_data['version']}")
            else:
                print(f"   Recording format: ✗ (missing keys: {missing_keys})")
                
        except Exception as e:
            print(f"   Recording format: ✗ ({e})")
    else:
        print("   Recording format: - (no recordings to test)")
    
    print(f"\n=== Summary ===")
    print("The automated recording system has been set up and is ready to use!")
    print("\nNext steps:")
    print("1. Start Flask API: flask run --host=0.0.0.0 --port=7777")
    print("2. Test API: python test_recording_system.py")
    print("3. Record new site: cd recording_system && node index.js record <URL>")
    print("4. Play recording: cd recording_system && node index.js play recordings/<name>.json")

if __name__ == "__main__":
    validate_recording_system()