from flask import Blueprint, request, jsonify, current_app
import subprocess
import os
import json
import tempfile
from pathlib import Path

recording_studio_bp = Blueprint('recording_studio', __name__)

# Base paths
RECORDING_SYSTEM_PATH = Path(__file__).parent.parent / "recording_system"
RECORDINGS_PATH = RECORDING_SYSTEM_PATH / "recordings"

@recording_studio_bp.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'recording_studio',
        'recording_system_path': str(RECORDING_SYSTEM_PATH),
        'recordings_path': str(RECORDINGS_PATH)
    })

@recording_studio_bp.route('/record', methods=['POST'])
def start_recording():
    """Start a new recording session"""
    try:
        data = request.get_json()
        url = data.get('url')
        recording_name = data.get('name')  # Optional now
        enhanced = data.get('enhanced', False)
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
            
        # Ensure recordings directory exists
        RECORDINGS_PATH.mkdir(exist_ok=True)
        
        # Auto-generate recording name if not provided
        if not recording_name:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(url)
                domain = parsed.hostname.replace('www.', '') if parsed.hostname else 'unknown'
                recording_name = domain.split('.')[0]  # e.g., partstown.com -> partstown
            except Exception:
                recording_name = 'recording'
        
        # Generate output path
        output_path = RECORDINGS_PATH / f"{recording_name}.json"
        
        # Build command (let CLI auto-generate path, but we'll track the expected name)
        cmd = [
            'node', 
            str(RECORDING_SYSTEM_PATH / 'index.js'),
            'record',
            url
        ]
        
        if enhanced:
            cmd.append('--enhanced')
            
        # Start recording process (non-blocking)
        # Note: This will open a browser window for user interaction
        process = subprocess.Popen(
            cmd,
            cwd=str(RECORDING_SYSTEM_PATH),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        return jsonify({
            'status': 'recording_started',
            'url': url,
            'recording_name': recording_name,
            'output_path': str(output_path),
            'process_id': process.pid,
            'enhanced': enhanced,
            'message': 'Recording session started. Interact with the browser and press Ctrl+C to stop.'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@recording_studio_bp.route('/recordings', methods=['GET'])
def list_recordings():
    """List all available recordings"""
    try:
        recordings = []
        
        if RECORDINGS_PATH.exists():
            for recording_file in RECORDINGS_PATH.glob('*.json'):
                try:
                    with open(recording_file, 'r') as f:
                        recording_data = json.load(f)
                    
                    recordings.append({
                        'name': recording_file.stem,
                        'file': recording_file.name,
                        'start_url': recording_data.get('startUrl', 'Unknown'),
                        'timestamp': recording_data.get('timestamp'),
                        'actions_count': len(recording_data.get('actions', [])),
                        'version': recording_data.get('version', '1.0')
                    })
                except Exception as e:
                    # Skip invalid recording files
                    current_app.logger.warning(f"Skipping invalid recording {recording_file}: {e}")
                    continue
        
        return jsonify({
            'recordings': recordings,
            'count': len(recordings)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@recording_studio_bp.route('/recording/<recording_name>', methods=['GET'])
def get_recording(recording_name):
    """Get details of a specific recording"""
    try:
        recording_file = RECORDINGS_PATH / f"{recording_name}.json"
        
        if not recording_file.exists():
            return jsonify({'error': 'Recording not found'}), 404
            
        with open(recording_file, 'r') as f:
            recording_data = json.load(f)
            
        return jsonify({
            'name': recording_name,
            'data': recording_data
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@recording_studio_bp.route('/play', methods=['POST'])
def play_recording():
    """Play back a recording"""
    try:
        data = request.get_json()
        recording_name = data.get('recording_name')
        variables = data.get('variables', {})
        options = data.get('options', {})
        
        if not recording_name:
            return jsonify({'error': 'recording_name is required'}), 400
            
        recording_file = RECORDINGS_PATH / f"{recording_name}.json"
        
        if not recording_file.exists():
            return jsonify({'error': 'Recording not found'}), 404
        
        # Build command
        cmd = [
            'node',
            str(RECORDING_SYSTEM_PATH / 'index.js'),
            'play',
            str(recording_file)
        ]
        
        # Add options
        if options.get('headless'):
            cmd.append('--headless')
        if options.get('slow_mo'):
            cmd.extend(['--slow-mo', str(options['slow_mo'])])
        if options.get('ignore_errors'):
            cmd.append('--ignore-errors')
        if options.get('keep_open'):
            cmd.append('--keep-open')
        if options.get('fast'):
            cmd.append('--fast')
        if options.get('click_delay'):
            cmd.extend(['--click-delay', str(options['click_delay'])])
        if options.get('input_delay'):
            cmd.extend(['--input-delay', str(options['input_delay'])])
        if options.get('nav_delay'):
            cmd.extend(['--nav-delay', str(options['nav_delay'])])
        if options.get('wait_for_idle'):
            cmd.append('--wait-for-idle')
        if options.get('conservative'):
            cmd.append('--conservative')
            
        # Handle variables
        if variables:
            # Create temporary variables file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                json.dump(variables, f)
                temp_vars_file = f.name
            
            cmd.extend(['--vars-file', temp_vars_file])
            
            # Also add dummy values file if it exists
            dummy_values_file = RECORDING_SYSTEM_PATH / 'dummy_values.json'
            if dummy_values_file.exists():
                cmd.extend(['--dummy-values-file', str(dummy_values_file)])
        
        # Execute playback
        result = subprocess.run(
            cmd,
            cwd=str(RECORDING_SYSTEM_PATH),
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        # Clean up temp file
        if variables and 'temp_vars_file' in locals():
            try:
                os.unlink(temp_vars_file)
            except:
                pass
                
        return jsonify({
            'status': 'completed',
            'recording_name': recording_name,
            'return_code': result.returncode,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'success': result.returncode == 0
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Playback timed out after 5 minutes'}), 408
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@recording_studio_bp.route('/clone', methods=['POST']) 
def clone_recording():
    """Clone a recording to run on a different URL"""
    try:
        data = request.get_json()
        recording_name = data.get('recording_name')
        new_url = data.get('url')
        variables = data.get('variables', {})
        options = data.get('options', {})
        
        if not recording_name or not new_url:
            return jsonify({'error': 'recording_name and url are required'}), 400
            
        recording_file = RECORDINGS_PATH / f"{recording_name}.json"
        
        if not recording_file.exists():
            return jsonify({'error': 'Recording not found'}), 404
        
        # Build command
        cmd = [
            'node',
            str(RECORDING_SYSTEM_PATH / 'index.js'),
            'clone',
            str(recording_file),
            new_url
        ]
        
        # Add options
        if options.get('headless'):
            cmd.append('--headless')
        if options.get('slow_mo'):
            cmd.extend(['--slow-mo', str(options['slow_mo'])])
        if options.get('ignore_errors'):
            cmd.append('--ignore-errors')
        if options.get('keep_open'):
            cmd.append('--keep-open')
        if options.get('fast'):
            cmd.append('--fast')
        if options.get('click_delay'):
            cmd.extend(['--click-delay', str(options['click_delay'])])
        if options.get('input_delay'):
            cmd.extend(['--input-delay', str(options['input_delay'])])
        if options.get('nav_delay'):
            cmd.extend(['--nav-delay', str(options['nav_delay'])])
        if options.get('wait_for_idle'):
            cmd.append('--wait-for-idle')
        if options.get('conservative'):
            cmd.append('--conservative')
            
        # Handle variables
        if variables:
            # Create temporary variables file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                json.dump(variables, f)
                temp_vars_file = f.name
            
            cmd.extend(['--vars-file', temp_vars_file])
            
            # Also add dummy values file if it exists
            dummy_values_file = RECORDING_SYSTEM_PATH / 'dummy_values.json'
            if dummy_values_file.exists():
                cmd.extend(['--dummy-values-file', str(dummy_values_file)])
        
        # Execute clone playback
        result = subprocess.run(
            cmd,
            cwd=str(RECORDING_SYSTEM_PATH),
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        # Clean up temp file
        if variables and 'temp_vars_file' in locals():
            try:
                os.unlink(temp_vars_file)
            except:
                pass
                
        return jsonify({
            'status': 'completed',
            'recording_name': recording_name,
            'new_url': new_url,
            'return_code': result.returncode,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'success': result.returncode == 0
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Clone playback timed out after 5 minutes'}), 408
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@recording_studio_bp.route('/available', methods=['GET'])
def get_available_recordings():
    """Get list of domains with available recordings for frontend integration"""
    try:
        domains = []
        
        if RECORDINGS_PATH.exists():
            for recording_file in RECORDINGS_PATH.glob('*.json'):
                try:
                    with open(recording_file, 'r') as f:
                        recording_data = json.load(f)
                    
                    start_url = recording_data.get('startUrl')
                    if start_url:
                        from urllib.parse import urlparse
                        parsed = urlparse(start_url)
                        domain = parsed.hostname
                        if domain:
                            # Remove www. prefix for consistency
                            domain = domain.replace('www.', '')
                            if domain not in domains:
                                domains.append(domain)
                except Exception:
                    continue
        
        return jsonify({
            'domains': domains,
            'count': len(domains)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@recording_studio_bp.route('/variables', methods=['GET'])
def get_variables():
    """Get current variables for admin interface"""
    try:
        variables_file = RECORDING_SYSTEM_PATH / 'variables.json'
        
        if variables_file.exists():
            with open(variables_file, 'r') as f:
                variables = json.load(f)
        else:
            # Return default structure
            variables = {
                "first_name": "",
                "last_name": "",
                "email": "",
                "phone": "",
                "company": "",
                "address": "",
                "address2": "",
                "city": "",
                "state": "",
                "zip_code": "",
                "country": "United States",
                "credit_card": "",
                "expiry_month": "",
                "expiry_year": "",
                "cvv": "",
                "billing_first_name": "",
                "billing_last_name": "",
                "billing_address": "",
                "billing_address2": "",
                "billing_city": "",
                "billing_state": "",
                "billing_zip": ""
            }
        
        return jsonify({
            'variables': variables
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@recording_studio_bp.route('/variables', methods=['POST'])
def update_variables():
    """Update variables for purchase automation"""
    try:
        data = request.get_json()
        variables = data.get('variables', {})
        
        variables_file = RECORDING_SYSTEM_PATH / 'variables.json'
        
        # Ensure the directory exists
        variables_file.parent.mkdir(exist_ok=True)
        
        with open(variables_file, 'w') as f:
            json.dump(variables, f, indent=2)
        
        return jsonify({
            'status': 'updated',
            'variables': variables
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@recording_studio_bp.route('/recording/<recording_name>', methods=['DELETE'])
def delete_recording(recording_name):
    """Delete a recording"""
    try:
        recording_file = RECORDINGS_PATH / f"{recording_name}.json"
        
        if not recording_file.exists():
            return jsonify({'error': 'Recording not found'}), 404
            
        recording_file.unlink()
        
        return jsonify({
            'status': 'deleted',
            'recording_name': recording_name
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500