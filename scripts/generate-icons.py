import os
from PIL import Image

def main():
    src_path = 'assets/2FAst.png'
    if not os.path.exists(src_path):
        print(f"Source file not found: {src_path}")
        return

    # Load high-res source image
    img = Image.open(src_path).convert('RGBA')
    width, height = img.size

    # Remove dark background to make a transparent version
    # Threshold sum(R, G, B) < 120 (approx average brightness < 40)
    data = img.getdata()
    transparent_data = []
    for p in data:
        r, g, b, a = p
        if r + g + b < 120:
            transparent_data.append((0, 0, 0, 0))
        else:
            transparent_data.append((r, g, b, a))

    transparent_img = Image.new('RGBA', img.size)
    transparent_img.putdata(transparent_data)

    # 1. Save standard app icon as transparent PNG (512x512)
    icon_png = transparent_img.resize((512, 512), Image.Resampling.LANCZOS)
    icon_png.save('assets/icon.png', 'PNG')
    print("Saved assets/icon.png")

    # 2. Save standard app icon as Windows ICO
    ico_img = transparent_img.resize((256, 256), Image.Resampling.LANCZOS)
    ico_img.save('assets/icon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("Saved assets/icon.ico")

    # 3. Save standard app icon as macOS ICNS
    icns_img = transparent_img.resize((512, 512), Image.Resampling.LANCZOS)
    icns_img.save('assets/icon.icns', format='ICNS', sizes=[(16, 16, 1), (32, 32, 1), (128, 128, 1), (256, 256, 1), (512, 512, 1)])
    print("Saved assets/icon.icns")

    # 4. Generate active tray icons (retains vibrant cyan/teal color)
    tray_active_16 = transparent_img.resize((16, 16), Image.Resampling.LANCZOS)
    tray_active_16.save('assets/tray-icon-active.png', 'PNG')
    tray_active_32 = transparent_img.resize((32, 32), Image.Resampling.LANCZOS)
    tray_active_32.save('assets/tray-icon-active@2x.png', 'PNG')
    print("Saved active tray icons")

    # 5. Generate idle tray icons (monochrome light-grey/white)
    # Convert all non-transparent pixels to light grey (240, 240, 240)
    def make_monochrome(pil_img, color=(240, 240, 240)):
        img_data = pil_img.getdata()
        mono_data = []
        for p in img_data:
            r, g, b, a = p
            if a > 0:
                # Apply color, preserving original alpha for antialiasing
                mono_data.append((color[0], color[1], color[2], a))
            else:
                mono_data.append((0, 0, 0, 0))
        new_img = Image.new('RGBA', pil_img.size)
        new_img.putdata(mono_data)
        return new_img

    tray_idle_16 = make_monochrome(tray_active_16)
    tray_idle_16.save('assets/tray-icon.png', 'PNG')
    tray_idle_32 = make_monochrome(tray_active_32)
    tray_idle_32.save('assets/tray-icon@2x.png', 'PNG')
    print("Saved idle tray icons")

    # 6. Generate macOS template icons (monochrome dark grey/black, macOS templates auto-tint)
    # macOS templates are usually black (0, 0, 0) with variable alpha
    tray_template_16 = make_monochrome(tray_active_16, color=(0, 0, 0))
    tray_template_16.save('assets/tray-iconTemplate.png', 'PNG')
    tray_template_32 = make_monochrome(tray_active_32, color=(0, 0, 0))
    tray_template_32.save('assets/tray-iconTemplate@2x.png', 'PNG')
    print("Saved macOS template tray icons")

if __name__ == '__main__':
    main()
