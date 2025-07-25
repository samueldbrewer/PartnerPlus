#!/usr/bin/env python3
"""
Test script to process first few rows of equipment CSV with enhanced logging
"""

import subprocess
import sys
from pathlib import Path
import time

def main():
    script_dir = Path(__file__).parent
    input_csv = script_dir / "foodservice-equipment-list.csv"
    output_csv = script_dir / "test_processed_equipment.csv"
    processor_script = script_dir / "process_equipment_csv.py"
    test_log = script_dir / "test_processing.log"
    
    if not input_csv.exists():
        print(f"❌ ERROR: Input CSV file not found: {input_csv}")
        sys.exit(1)
    
    if not processor_script.exists():
        print(f"❌ ERROR: Processor script not found: {processor_script}")
        sys.exit(1)
    
    print("🧪 TESTING Equipment CSV Processor")
    print("=" * 60)
    print(f"📁 Input: {input_csv}")
    print(f"📁 Output: {output_csv}")
    print(f"📁 Log: {test_log}")
    print(f"🔢 Processing: First 3 rows")
    print(f"⏱️  Delay: 2.0 seconds between API calls")
    print("=" * 60)
    
    # Check if tqdm is available
    try:
        import tqdm
        print("✅ Progress bar support available")
    except ImportError:
        print("⚠️  Install tqdm for progress bars: pip install tqdm")
    
    # Remove old output files
    if output_csv.exists():
        output_csv.unlink()
        print("🗑️  Removed old output file")
    
    if test_log.exists():
        test_log.unlink()
        print("🗑️  Removed old log file")
    
    # Run the processor for just 3 rows
    cmd = [
        sys.executable,
        str(processor_script),
        str(input_csv),
        "--output", str(output_csv),
        "--max-rows", "3",
        "--delay", "2.0",  # Slower for testing
        "--log-file", str(test_log)
    ]
    
    print("\n🚀 Starting test processing...")
    print(f"Command: {' '.join(cmd)}")
    print("=" * 60)
    
    start_time = time.time()
    
    try:
        # Run without capturing output so we can see the progress bar
        result = subprocess.run(cmd, check=True, text=True)
        
        elapsed = time.time() - start_time
        print("=" * 60)
        print(f"✅ SUCCESS! Test completed in {elapsed:.1f} seconds")
        
        # Show results
        if output_csv.exists():
            print(f"\n📁 Output file created: {output_csv}")
            
            # Count rows
            with open(output_csv, 'r') as f:
                lines = f.readlines()
                row_count = len(lines) - 1  # Subtract header
                print(f"📊 Rows processed: {row_count}")
            
            # Show sample output
            print("\n📋 Sample output (first few lines):")
            print("-" * 60)
            with open(output_csv, 'r') as f:
                for i, line in enumerate(f):
                    if i < 4:  # Show header + 3 data rows
                        print(f"{i:2}: {line.rstrip()}")
                    else:
                        break
        
        # Show log summary
        if test_log.exists():
            print(f"\n📁 Log file created: {test_log}")
            with open(test_log, 'r') as f:
                log_lines = f.readlines()
                print(f"📊 Log entries: {len(log_lines)}")
                
                # Count different log levels
                success_count = sum(1 for line in log_lines if "✅" in line)
                error_count = sum(1 for line in log_lines if "ERROR" in line)
                warning_count = sum(1 for line in log_lines if "WARNING" in line)
                
                print(f"✅ Success events: {success_count}")
                print(f"⚠️  Warning events: {warning_count}")
                print(f"❌ Error events: {error_count}")
        
        print("\n🎉 Test completed successfully!")
        print(f"Next step: Run full processing with:")
        print(f"python {processor_script} {input_csv}")
        
    except subprocess.CalledProcessError as e:
        elapsed = time.time() - start_time
        print("=" * 60)
        print(f"❌ ERROR: Test failed after {elapsed:.1f} seconds")
        print(f"Return code: {e.returncode}")
        
        # Show log if available
        if test_log.exists():
            print(f"\n📁 Check log file for details: {test_log}")
            with open(test_log, 'r') as f:
                last_lines = f.readlines()[-10:]  # Show last 10 lines
                print("Last log entries:")
                for line in last_lines:
                    print(f"  {line.rstrip()}")
        
        sys.exit(1)

if __name__ == '__main__':
    main()