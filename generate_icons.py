"""从 icon.png 生成 Tauri 应用图标集

源图为 RGB，白色背景。本脚本会：
  1. 将近白色像素转为透明（alpha=0）
  2. 自动裁掉白色边距
  3. 应用圆角遮罩（iOS 风格 ~22% 圆角）
  4. 缩放生成 Tauri 所需的多尺寸 PNG / ICO

运行方式：在项目根目录执行 python generate_icons.py
"""
from PIL import Image
import os

ICON_DIR = "tauri-app/src-tauri/icons"
PUBLIC_DIR = "tauri-app/public"

# 白色判定阈值：RGB 三个通道均 >= THRESHOLD 视为白色
WHITE_THRESHOLD = 245
# 圆角半径占正方形边长的比例（iOS / macOS 风格 ~22%）
CORNER_RATIO = 0.22


def make_white_transparent(img: Image.Image, threshold: int) -> Image.Image:
    """将近白色像素转为完全透明"""
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (r, g, b, 0)
    return img


def crop_to_content(img: Image.Image) -> Image.Image:
    """按非透明像素自动裁剪到内容边界"""
    bbox = img.getbbox()
    if not bbox:
        return img
    return img.crop(bbox)


def apply_rounded_corners(img: Image.Image, ratio: float) -> Image.Image:
    """在正方形画布上应用圆角遮罩"""
    w, h = img.size
    size = min(w, h)
    # 居中补正方形
    if w != h:
        side = size
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
        img = canvas
        w = h = side
    else:
        img = img.copy()

    radius = int(w * ratio)
    # 生成圆角 alpha 遮罩
    mask = Image.new("L", (w, h), 0)
    m_px = mask.load()
    for y in range(h):
        for x in range(w):
            # 四个角分别判断
            in_corner = False
            cx, cy = 0, 0
            if x < radius and y < radius:
                in_corner = True
                cx, cy = radius, radius
            elif x >= w - radius and y < radius:
                in_corner = True
                cx, cy = w - radius - 1, radius
            elif x < radius and y >= h - radius:
                in_corner = True
                cx, cy = radius, h - radius - 1
            elif x >= w - radius and y >= h - radius:
                in_corner = True
                cx, cy = w - radius - 1, h - radius - 1
            if in_corner:
                if (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2:
                    m_px[x, y] = 255
            else:
                m_px[x, y] = 255
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def process_source() -> Image.Image:
    """加载并预处理源图：白底转透明 + 裁边 + 圆角"""
    src = Image.open("icon.png")
    print(f"原始: {src.size} {src.mode}")
    transparent = make_white_transparent(src, WHITE_THRESHOLD)
    cropped = crop_to_content(transparent)
    print(f"裁剪后: {cropped.size}")
    rounded = apply_rounded_corners(cropped, CORNER_RATIO)
    print(f"圆角后: {rounded.size} {rounded.mode}")
    return rounded


# Tauri 需要的图标尺寸
tauri_sizes = {
    "32x32.png": (32, 32),
    "128x128.png": (128, 128),
    "128x128@2x.png": (256, 256),
    "icon.png": (512, 512),
    "Square30x30Logo.png": (30, 30),
    "Square44x44Logo.png": (44, 44),
    "Square71x71Logo.png": (71, 71),
    "Square89x89Logo.png": (89, 89),
    "Square107x107Logo.png": (107, 107),
    "Square142x142Logo.png": (142, 142),
    "Square150x150Logo.png": (150, 150),
    "Square284x284Logo.png": (284, 284),
    "Square310x310Logo.png": (310, 310),
    "StoreLogo.png": (50, 50),
}

if __name__ == "__main__":
    logo = process_source()
    os.makedirs(ICON_DIR, exist_ok=True)
    os.makedirs(PUBLIC_DIR, exist_ok=True)

    # 生成 Tauri 多尺寸 PNG
    for name, size in tauri_sizes.items():
        resized = logo.resize(size, Image.LANCZOS)
        out = os.path.join(ICON_DIR, name)
        resized.save(out, "PNG", optimize=True)
        print(f"  {name}: {size}")

    # 应用启动图
    app_png = logo.resize((256, 256), Image.LANCZOS)
    app_png.save(os.path.join(ICON_DIR, "app.png"), "PNG", optimize=True)
    print(f"  app.png: (256, 256)")

    # Windows 多分辨率 ICO（直接用 sizes 参数，Pillow 自动从源图缩放）
    # 注意：append_images 方式在 Pillow 中生成的 ICO 只有 ~1KB，存在 bug
    logo.convert("RGBA").save(
        os.path.join(ICON_DIR, "icon.ico"),
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"  icon.ico: 7 resolutions (16-256px)")

    # 前端展示用 logo
    logo_png = logo.resize((128, 128), Image.LANCZOS)
    logo_png.save(os.path.join(PUBLIC_DIR, "logo.png"), "PNG", optimize=True)
    print(f"  public/logo.png: (128, 128)")

    print("\n所有图标已生成完成")
