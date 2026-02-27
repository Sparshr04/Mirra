import open3d as o3d
import sys
import numpy as np
import time

if len(sys.argv) < 2:
    print("Usage: python render_ply.py <file.ply>")
    exit()

file_path = sys.argv[1]

# Try reading as point cloud
geometry = o3d.io.read_point_cloud(file_path)

# If empty, try mesh
if len(geometry.points) == 0:
    geometry = o3d.io.read_triangle_mesh(file_path)
    geometry.compute_vertex_normals()

vis = o3d.visualization.Visualizer()
vis.create_window(width=1280, height=720)
vis.add_geometry(geometry)

# 🔥 Set background to black
opt = vis.get_render_option()
opt.background_color = np.array([0, 0, 0])
opt.point_size = 2.0
opt.light_on = True
# Auto rotate
ctr = vis.get_view_control()

for _ in range(8000):  # number of frames (controls duration)
    ctr.rotate(1.0, 0.0)  # horizontal rotation
    vis.poll_events()
    vis.update_renderer()
    time.sleep(0.01)

vis.destroy_window()
