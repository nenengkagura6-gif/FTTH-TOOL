"""
Test script for API endpoints
"""
import requests
import sys
import os

BASE_URL = "http://127.0.0.1:8000"


def test_health():
    """Test health endpoint"""
    print("Testing health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"  Status: {response.status_code}")
        print(f"  Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def test_config():
    """Test config endpoint"""
    print("\nTesting config endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/config")
        print(f"  Status: {response.status_code}")
        print(f"  Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def test_validate_kml(kml_path):
    """Test KML validation endpoint"""
    print(f"\nTesting KML validation with {kml_path}...")
    try:
        with open(kml_path, "rb") as f:
            files = {"kml_file": f}
            response = requests.post(f"{BASE_URL}/validate-kml", files=files)
        print(f"  Status: {response.status_code}")
        print(f"  Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def test_kml_to_excel(kml_path, template_path=None):
    """Test KML to Excel conversion"""
    print(f"\nTesting KML to Excel with {kml_path}...")
    try:
        files = {}
        with open(kml_path, "rb") as f:
            files["kml_file"] = f
            if template_path and os.path.exists(template_path):
                files["template"] = open(template_path, "rb")
            
            response = requests.post(f"{BASE_URL}/kml-to-excel", files=files)
            
            if template_path and os.path.exists(template_path):
                files["template"].close()
        
        print(f"  Status: {response.status_code}")
        if response.status_code == 200:
            output_file = "test_output.xlsx"
            with open(output_file, "wb") as f:
                f.write(response.content)
            print(f"  Output saved to: {output_file}")
            return True
        else:
            print(f"  Error: {response.text}")
            return False
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def test_apd_hpdb(kml_path, template_path=None):
    """Test APD HPDB processing"""
    print(f"\nTesting APD HPDB with {kml_path}...")
    try:
        files = {}
        with open(kml_path, "rb") as f:
            files["kml_file"] = f
            if template_path and os.path.exists(template_path):
                files["template"] = open(template_path, "rb")
            
            response = requests.post(f"{BASE_URL}/apd-hpdb", files=files)
            
            if template_path and os.path.exists(template_path):
                files["template"].close()
        
        print(f"  Status: {response.status_code}")
        if response.status_code == 200:
            output_file = "test_apd_output.xlsx"
            with open(output_file, "wb") as f:
                f.write(response.content)
            print(f"  Output saved to: {output_file}")
            return True
        else:
            print(f"  Error: {response.text}")
            return False
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def test_check_duplicates(kml_paths):
    """Test duplicate checking"""
    print(f"\nTesting check duplicates with {len(kml_paths)} files...")
    try:
        files = []
        file_handles = []
        for path in kml_paths:
            if os.path.exists(path):
                f = open(path, "rb")
                files.append(("kml_files", (os.path.basename(path), f, "application/vnd.google-earth.kml+xml")))
                file_handles.append(f)
        
        data = {"max_distance": "1.0", "output_format": "json"}
        response = requests.post(f"{BASE_URL}/check-duplicates", files=files, data=data)
        
        for f in file_handles:
            f.close()
        
        print(f"  Status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"  Total points: {result['summary']['total_points']}")
            print(f"  Duplicates: {result['summary']['duplicate_count']}")
            return True
        else:
            print(f"  Error: {response.text}")
            return False
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("KML Processing API Test Suite")
    print("=" * 60)
    
    results = []
    
    # Basic tests
    results.append(("Health", test_health()))
    results.append(("Config", test_config()))
    
    # File-based tests (if files exist)
    kml_files = [f for f in os.listdir(".") if f.endswith(".kml")]
    
    if kml_files:
        print(f"\nFound KML files: {kml_files}")
        test_kml = kml_files[0]
        
        results.append(("Validate KML", test_validate_kml(test_kml)))
        results.append(("KML to Excel", test_kml_to_excel(test_kml, "BOQ_Template.xlsx")))
        results.append(("APD HPDB", test_apd_hpdb(test_kml, "APD_HPDB_.xlsx")))
        
        if len(kml_files) >= 2:
            results.append(("Check Duplicates", test_check_duplicates(kml_files[:2])))
    else:
        print("\nNo KML files found in current directory. Skipping file tests.")
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    for name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"  {name}: {status}")
    
    passed_count = sum(1 for _, passed in results if passed)
    print(f"\nTotal: {passed_count}/{len(results)} tests passed")