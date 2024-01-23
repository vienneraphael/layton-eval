from io import BytesIO
from typing import Tuple

import requests
from PIL import Image, ImageDraw, ImageFont


def inject_text(
    image: Image.Image,
    text: str,
    textbox_height: Tuple[int] = None,
    box_fill: Tuple[int] = (255, 255, 255),
    font_family: str = "Pillow/Tests/fonts/FreeMono.ttf",
    font_size: int = 12,
    fill: Tuple[int] = (0, 0, 0),
) -> Image.Image:
    """Creates a new image with the given text injected into it.

    Args:
        image: A PIL Image object.
        text: A string of text to inject into the image.
        textbox_height: An integer representing the height of the text box.
        box_fill: A tuple of integers representing the color of the text box.
        font_family: A string representing the font family.
        font_size: An integer representing the font size.
        fill: A tuple of integers representing the color of the text.

    Returns:
        A PIL Image object with the text injected into it.
    """

    def fit_text(text, font_size, width):
        # Modifies the text to fit the given width.
        words = text.split()
        line, new_text = "", ""
        for word in words:
            if len(line + word) * font_size < width * 1.7:
                line += word + " "
            else:
                new_text += line + "\n"
                line = word + " "
        new_text += line
        return new_text

    # Determining the height of the text box
    width, old_height = image.size
    if textbox_height is None:
        text = fit_text(text, font_size, width)
        textbox_height = int(1.2 * font_size * len(text.split("\n")))

    # Creating new image
    new_size = (width, old_height + textbox_height)
    new_image = Image.new("RGB", new_size, box_fill)

    # Pasting original image on top
    new_image.paste(image, (0, 0))

    # Drawing text
    draw = ImageDraw.Draw(new_image)
    font = ImageFont.truetype(font_family, font_size)
    draw.multiline_text((0, image.size[1]), text, fill=fill, font=font)

    return new_image


def main():
    # Getting the image
    url = "https://static.wikia.nocookie.net/layton/images/f/fa/CV037.gif/revision/latest?cb=20110120092650"
    image = Image.open(BytesIO(requests.get(url).content))

    # Text
    text = 'A boy and his big sister are sitting around the kitchen table chatting.\n\n"You know, Sis, if I took away two years from my age and gave them to you, you\'d be twice my age, huh!"\n\n"Well, why don\'t you just give me one more on top of that? Then I\'ll be three times your age."\n\nSo just how old is each sibling?'

    # Injecting the text
    new_image = inject_text(image, text, font_size=16)

    # Showing the new image
    new_image.show()


if __name__ == "__main__":
    main()
