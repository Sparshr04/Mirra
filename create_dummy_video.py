import cv2
import numpy as np
import os

os.makedirs("data/raw", exist_ok=True)
video_path = "data/raw/test.mp4"

# Create a video with moving shapes
height, width = 512, 512
fourcc = cv2.VideoWriter_fourcc(*"mp4v")
out = cv2.VideoWriter(video_path, fourcc, 30.0, (width, height))

for i in range(30):
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    # Moving circle
    cv2.circle(frame, (i * 10 + 50, i * 5 + 50), 40, (0, 255, 0), -1)
    # Static rectangle
    cv2.rectangle(frame, (300, 300), (400, 400), (0, 0, 255), -1)
    out.write(frame)

out.release()
print(f"Created {video_path}")
