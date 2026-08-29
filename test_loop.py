from app.engines.kml_apd_engine import haversine

fdts = {'KOTAK FDT 01': (0.0, 100.0), 'ODP FDT 02': (0.0, 100.1)}

poles = {
    'Pole 1': (0.0, 100.0001, False),
    'Pole 2': (0.0, 100.05, False),
    'Pole 3': (0.0, 100.1001, False),
    'Pole 4': (0.0, 100.15, False)
}

order = ['Pole 1', 'Pole 2', 'Pole 3', 'Pole 4']
current_fdt = 'KOTAK FDT 01'

for pm in order:
    lat, lon, is_exist = poles[pm]
    print(f'Checking {pm} at {lat}, {lon}')
    for fname, (flat, flon) in fdts.items():
        d = haversine(lat, lon, flat, flon)
        print(f'  Dist to {fname}: {d}')
        if d <= 25.0:
            current_fdt = fname
            print(f'  --> Switched to {fname}')
            break
    print(f'  Assigned to {current_fdt}')
