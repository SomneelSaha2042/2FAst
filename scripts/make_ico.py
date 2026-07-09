import sys
from PIL import Image

def create_hq_ico(input_path, output_path):
    img = Image.open(input_path)
    
    # Ensure it's RGBA
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
    
    # Create resized images using Lanczos (high quality)
    icon_images = []
    for size in sizes:
        resized_img = img.resize(size, Image.Resampling.LANCZOS)
        icon_images.append(resized_img)
        
    # Save as ICO, providing the list of images so it doesn't do its own poor resizing
    # The first image (256x256) is used as the base, the rest are appended
    icon_images[0].save(
        output_path,
        format='ICO',
        sizes=sizes,
        append_images=icon_images[1:]
    )
    print("Successfully created high-quality ICO")

if __name__ == "__main__":
    create_hq_ico("assets/2FAst.png", "resources/icon.ico")
