"""Read-only PDF preview rendering, one bounded-size page at a time."""
import json
import os
import sys
import pypdfium2 as pdfium

source, destination = sys.argv[1:3]
os.makedirs(destination, exist_ok=True)
result = []
with pdfium.PdfDocument(source) as doc:
    if len(doc) > 100:
        raise ValueError('Please split PDFs longer than 100 pages before inspection.')
    for index in range(len(doc)):
        page = doc[index]
        try:
            width, height = page.get_size()
            scale = min(2, 2000 / max(width, height))
            bitmap = page.render(scale=scale, limit_image_cache=True)
            try:
                image = bitmap.to_pil()
                try:
                    name = f'page-{index + 1}.png'
                    image.save(os.path.join(destination, name))
                    result.append(dict(pageNum=index + 1, fileName=name,
                                       pixelWidth=image.width, pixelHeight=image.height))
                finally:
                    image.close()
            finally:
                bitmap.close()
        finally:
            page.close()
print(json.dumps(result))
