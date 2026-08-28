"""Build, render, and export the Caribbean Career POC sloop.

Run from the repository root:

    blender --background --python tools/caribbean-sloop/build_sloop.py

The script owns every vertex and material it emits. It intentionally builds a
stylized, game-scale late-17th/early-18th-century small sailing craft rather
than reproducing a specific museum vessel.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / "output"
RENDER_DIR = OUTPUT_DIR / "renders"
BLEND_PATH = OUTPUT_DIR / "caribbean-sloop.blend"
RAW_GLB_PATH = OUTPUT_DIR / "caribbean-sloop.raw.glb"
REPORT_PATH = OUTPUT_DIR / "asset-report.raw.json"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
RENDER_DIR.mkdir(parents=True, exist_ok=True)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(name: str, color: tuple[float, float, float, float], *, roughness: float = 0.65, metallic: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def add_mesh(name: str, vertices: list[tuple[float, float, float]], faces: list[tuple[int, ...]], mat: bpy.types.Material, parent: bpy.types.Object) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.parent = parent
    for polygon in mesh.polygons:
        polygon.use_smooth = name.startswith("Hull")
    return obj


def bevel(obj: bpy.types.Object, width: float, segments: int = 2) -> None:
    modifier = obj.modifiers.new(name="Edge Softness", type="BEVEL")
    modifier.width = width
    modifier.segments = segments


def cylinder_between(name: str, start: tuple[float, float, float], end: tuple[float, float, float], radius: float, mat: bpy.types.Material, parent: bpy.types.Object, vertices: int = 10) -> bpy.types.Object:
    a, b = Vector(start), Vector(end)
    direction = b - a
    midpoint = (a + b) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def cube(name: str, location: tuple[float, float, float], scale: tuple[float, float, float], mat: bpy.types.Material, parent: bpy.types.Object, bevel_width: float = 0.06) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    obj.parent = parent
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel_width:
        bevel(obj, bevel_width)
    return obj


def build_hull(root: bpy.types.Object, hull_mat: bpy.types.Material, wood: bpy.types.Material, trim: bpy.types.Material) -> None:
    # y, half-width, keel z, sheer/deck-edge z. Bow points toward +Y.
    stations = [
        (-6.1, 0.25, -0.35, 1.25),
        (-5.5, 1.45, -1.05, 1.45),
        (-3.4, 2.12, -1.52, 1.34),
        (-0.5, 2.42, -1.68, 1.30),
        (2.5, 2.15, -1.45, 1.46),
        (4.8, 1.45, -0.90, 1.72),
        (6.25, 0.16, -0.05, 1.98),
    ]
    cross = [-1.0, -0.82, -0.48, 0.0, 0.48, 0.82, 1.0]
    vertices: list[tuple[float, float, float]] = []
    for y, width, keel, sheer in stations:
        for side in cross:
            z = keel + (sheer - keel) * (abs(side) ** 0.62)
            # A fine entry and slightly tucked stern stop the POC reading as a tub.
            vertices.append((side * width, y, z))

    faces: list[tuple[int, ...]] = []
    ring = len(cross)
    for station in range(len(stations) - 1):
        for edge in range(ring - 1):
            a = station * ring + edge
            b = a + 1
            c = b + ring
            d = a + ring
            faces.append((a, b, c, d))
    faces.append(tuple(range(ring - 1, -1, -1)))
    last = (len(stations) - 1) * ring
    faces.append(tuple(last + i for i in range(ring)))
    hull = add_mesh("Hull", vertices, faces, hull_mat, root)
    bevel(hull, 0.045, 2)

    # A deck strip follows the hull rather than hiding the sheer under a box.
    deck_vertices: list[tuple[float, float, float]] = []
    for y, width, _keel, sheer in stations[1:-1]:
        deck_vertices.extend([(-width * 0.88, y, sheer - 0.03), (width * 0.88, y, sheer - 0.03)])
    deck_faces = []
    for i in range(len(stations) - 3):
        j = i * 2
        deck_faces.append((j, j + 1, j + 3, j + 2))
    deck = add_mesh("Deck_Main", deck_vertices, deck_faces, wood, root)
    solidify = deck.modifiers.new(name="Deck Thickness", type="SOLIDIFY")
    solidify.thickness = 0.12

    # Raised quarterdeck and small stern rail establish the period silhouette.
    cube("Deck_Quarter", (0, -4.45, 1.56), (1.38, 1.05, 0.12), wood, root, 0.09)
    cube("Stern_Transom", (0, -5.55, 0.72), (1.22, 0.12, 0.82), wood, root, 0.08)

    # Warm wale and brass pinstripe keep the hull readable at battle distance.
    for side in (-1, 1):
        points = []
        for y, width, _keel, sheer in stations[1:-1]:
            points.append((side * width * 1.01, y, sheer - 0.25))
        for index in range(len(points) - 1):
            cylinder_between(f"Hull_Wale_{'P' if side < 0 else 'S'}_{index + 1}", points[index], points[index + 1], 0.075, wood, root, 8)
            upper_a = (points[index][0], points[index][1], points[index][2] + 0.18)
            upper_b = (points[index + 1][0], points[index + 1][1], points[index + 1][2] + 0.18)
            cylinder_between(f"Hull_Trim_{'P' if side < 0 else 'S'}_{index + 1}", upper_a, upper_b, 0.025, trim, root, 6)

    # Keel and stem are exaggerated just enough to survive mobile scale.
    cylinder_between("Keel", (0, -5.1, -1.00), (0, 4.7, -0.82), 0.11, wood, root, 8)
    cylinder_between("Stem", (0, 4.7, -0.82), (0, 6.45, 2.02), 0.11, wood, root, 8)


def build_rig(root: bpy.types.Object, wood: bpy.types.Material, rope: bpy.types.Material, sail: bpy.types.Material, sail_mark: bpy.types.Material) -> None:
    cylinder_between("Mast_Main", (0, -0.65, 1.12), (0, -0.65, 11.75), 0.15, wood, root, 12)
    cylinder_between("Boom", (0, -0.75, 4.05), (0, -4.55, 4.18), 0.10, wood, root, 10)
    cylinder_between("Gaff", (0, -0.68, 10.2), (0, -3.75, 9.18), 0.09, wood, root, 10)
    cylinder_between("Bowsprit", (0, 4.0, 1.72), (0, 8.35, 3.34), 0.12, wood, root, 10)

    # The sail meshes have a shallow transverse belly instead of billboard-flat triangles.
    rows, cols = 6, 5
    main_vertices: list[tuple[float, float, float]] = []
    for row in range(rows):
        v = row / (rows - 1)
        front_y = -0.78 + 0.08 * v
        aft_y = -4.48 + 0.80 * v
        low_z = 4.18
        high_z = 9.15 + 1.02 * (1 - v)
        for col in range(cols):
            u = col / (cols - 1)
            y = aft_y + (front_y - aft_y) * u
            z = low_z + (high_z - low_z) * v
            belly = 0.24 * math.sin(math.pi * u) * math.sin(math.pi * v)
            main_vertices.append((belly, y, z))
    main_faces = []
    for row in range(rows - 1):
        for col in range(cols - 1):
            a = row * cols + col
            main_faces.append((a, a + 1, a + 1 + cols, a + cols))
    add_mesh("Sail_Main", main_vertices, main_faces, sail, root)

    jib_vertices = [
        (0.02, -0.48, 9.55),
        (0.16, 1.95, 7.15),
        (0.18, 5.85, 3.12),
        (0.02, -0.48, 3.25),
    ]
    add_mesh("Sail_Jib", jib_vertices, [(0, 1, 3), (1, 2, 3)], sail, root)

    # Original vermilion chevron functions as a team/readability mark, not a copied flag.
    mark_shape = [
        (-2.8, 5.9),
        (-1.25, 6.55),
        (-2.45, 7.0),
        (-1.15, 8.25),
        (-3.25, 7.05),
    ]
    for side_name, x in (("Port", -0.035), ("Starboard", 0.285)):
        mark = add_mesh(
            f"Sail_Mark_{side_name}",
            [(x, y, z) for y, z in mark_shape],
            [(0, 1, 2), (2, 3, 4)],
            sail_mark,
            root,
        )
        mark["team_tint"] = True

    rig_lines = [
        ("Rig_Forestay", (0, -0.65, 11.55), (0, 7.95, 3.22)),
        ("Rig_Backstay", (0, -0.65, 11.55), (0, -5.20, 1.72)),
        ("Rig_Shroud_Port_1", (0, -0.65, 10.55), (-1.78, -0.25, 1.48)),
        ("Rig_Shroud_Port_2", (0, -0.65, 8.75), (-1.88, -1.55, 1.42)),
        ("Rig_Shroud_Starboard_1", (0, -0.65, 10.55), (1.78, -0.25, 1.48)),
        ("Rig_Shroud_Starboard_2", (0, -0.65, 8.75), (1.88, -1.55, 1.42)),
        ("Rig_Jib_Foot", (0, -0.48, 3.25), (0, 6.65, 3.15)),
    ]
    for name, start, end in rig_lines:
        cylinder_between(name, start, end, 0.018, rope, root, 6)


def build_details(root: bpy.types.Object, wood: bpy.types.Material, dark_wood: bpy.types.Material, metal: bpy.types.Material, rope: bpy.types.Material, flag: bpy.types.Material) -> None:
    # Rail runs and posts are deliberately chunky enough for a 320 px ship crop.
    for side in (-1, 1):
        x = 1.83 * side
        cylinder_between(f"Rail_{'Port' if side < 0 else 'Starboard'}", (x, -4.6, 1.85), (x, 3.55, 1.88), 0.055, wood, root, 8)
        for index, y in enumerate((-4.4, -3.0, -1.5, 0.0, 1.5, 3.0)):
            cylinder_between(f"Rail_Post_{side}_{index}", (x, y, 1.37), (x, y, 1.86), 0.045, wood, root, 8)

    # Six small guns: separate parent nodes remain available for recoil/damage.
    for side in (-1, 1):
        for index, y in enumerate((-2.4, -0.1, 2.15), start=1):
            side_name = "Port" if side < 0 else "Starboard"
            gun_root = bpy.data.objects.new(f"Gun_{side_name}_{index}", None)
            bpy.context.collection.objects.link(gun_root)
            gun_root.parent = root
            cube(f"Gun_Carriage_{side_name}_{index}", (side * 1.47, y, 1.43), (0.27, 0.36, 0.16), dark_wood, gun_root, 0.035)
            cylinder_between(
                f"Gun_Barrel_{side_name}_{index}",
                (side * 1.35, y, 1.62),
                (side * 2.30, y, 1.68),
                0.10,
                metal,
                gun_root,
                10,
            )

    rudder = cube("Rudder", (0, -6.12, -0.04), (0.10, 0.38, 0.78), dark_wood, root, 0.04)
    rudder.rotation_euler.x = math.radians(-8)
    cylinder_between("Tiller", (0, -5.82, 0.55), (0, -3.92, 1.58), 0.07, wood, root, 8)

    cylinder_between("Capstan", (0, 0.75, 1.35), (0, 0.75, 2.00), 0.21, dark_wood, root, 10)
    cylinder_between("Capstan_Bar", (-0.65, 0.75, 1.87), (0.65, 0.75, 1.87), 0.055, wood, root, 8)

    # Stern lantern and pennant make front/back readable when hull length is foreshortened.
    cylinder_between("Lantern_Post", (0, -5.25, 1.66), (0, -5.25, 2.72), 0.055, metal, root, 8)
    cube("Lantern", (0, -5.25, 2.76), (0.19, 0.19, 0.28), flag, root, 0.04)
    flag_mesh = add_mesh(
        "Flag_Command",
        [(0, -0.68, 11.65), (0, -0.68, 12.80), (0, -2.10, 12.48)],
        [(0, 1, 2)],
        flag,
        root,
    )
    flag_mesh["team_tint"] = True

    # Coiled rope is suggested with two toruses rather than expensive strands.
    for x in (-0.85, 0.85):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.33, minor_radius=0.045, major_segments=12, minor_segments=6, location=(x, 3.0, 1.52))
        coil = bpy.context.object
        coil.name = f"Rope_Coil_{'Port' if x < 0 else 'Starboard'}"
        coil.data.materials.append(rope)
        coil.parent = root


def build_ship() -> bpy.types.Object:
    root = bpy.data.objects.new("CC_Sloop", None)
    bpy.context.collection.objects.link(root)
    root["asset"] = "Caribbean Career Sloop POC"
    root["forward_axis_blender"] = "+Y"
    root["meters_per_unit"] = 1.0

    hull_mat = material("Hull Deep Sound", (0.035, 0.26, 0.31, 1), roughness=0.46)
    wood = material("Sunlit Timber", (0.43, 0.22, 0.09, 1), roughness=0.72)
    dark_wood = material("Dark Timber", (0.17, 0.065, 0.028, 1), roughness=0.8)
    trim = material("Brass Trim", (0.62, 0.36, 0.09, 1), roughness=0.3, metallic=0.65)
    sail = material("Sunlit Sail", (0.84, 0.72, 0.52, 1), roughness=0.86)
    sail_mark = material("Signal Vermilion Team", (0.67, 0.055, 0.035, 1), roughness=0.62)
    metal = material("Black Iron", (0.055, 0.065, 0.07, 1), roughness=0.34, metallic=0.75)
    rope = material("Hemp Rigging", (0.15, 0.105, 0.058, 1), roughness=0.95)
    lantern = material("Lantern Amber", (0.95, 0.39, 0.06, 1), roughness=0.36, metallic=0.1)

    build_hull(root, hull_mat, wood, trim)
    build_rig(root, wood, rope, sail, sail_mark)
    build_details(root, wood, dark_wood, metal, rope, lantern)
    return root


def descendants(root: bpy.types.Object) -> list[bpy.types.Object]:
    result = [root]
    queue = list(root.children)
    while queue:
        obj = queue.pop(0)
        result.append(obj)
        queue.extend(obj.children)
    return result


def setup_review_scene(root: bpy.types.Object) -> tuple[bpy.types.Object, bpy.types.Object]:
    ocean_mat = material("Review Ocean", (0.015, 0.21, 0.30, 1), roughness=0.28, metallic=0.18)
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -1.72))
    ocean = bpy.context.object
    ocean.name = "REVIEW_Ocean"
    ocean.data.materials.append(ocean_mat)

    bpy.ops.object.light_add(type="AREA", location=(8, 6, 16))
    key = bpy.context.object
    key.name = "REVIEW_Key"
    key.data.energy = 1500
    key.data.shape = "DISK"
    key.data.size = 8
    key.data.color = (1.0, 0.72, 0.46)

    bpy.ops.object.light_add(type="AREA", location=(-10, -5, 9))
    fill = bpy.context.object
    fill.name = "REVIEW_Fill"
    fill.data.energy = 950
    fill.data.size = 10
    fill.data.color = (0.30, 0.64, 1.0)

    bpy.ops.object.light_add(type="AREA", location=(0, -10, 6))
    rim = bpy.context.object
    rim.name = "REVIEW_Rim"
    rim.data.energy = 800
    rim.data.size = 7
    rim.data.color = (0.20, 0.85, 0.85)

    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "REVIEW_Camera"
    camera.data.lens = 58
    bpy.context.scene.camera = camera

    world = bpy.context.scene.world or bpy.data.worlds.new("Review World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.018, 0.055, 0.075, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    scene.render.fps = 30
    scene.view_settings.exposure = 0.35
    scene.view_settings.look = "AgX - Medium High Contrast"
    root.location.z = 0
    return camera, ocean


def point_camera(camera: bpy.types.Object, location: tuple[float, float, float], target: tuple[float, float, float] = (0, 0, 4.3)) -> None:
    camera.location = location
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_views(camera: bpy.types.Object) -> list[str]:
    views = {
        "side-starboard": ((18.5, 0, 5.3), (0, 0, 4.5)),
        "bow": ((0, 21, 6.0), (0, 0.4, 4.2)),
        "stern": ((0, -21, 6.1), (0, -0.4, 4.2)),
        "top": ((0.01, 0, 25), (0, 0, 2.4)),
        "three-quarter-port": ((-15, 13, 9.2), (0, 0, 4.0)),
        "three-quarter-starboard": ((15, 13, 9.2), (0, 0, 4.0)),
    }
    paths = []
    for name, (location, target) in views.items():
        point_camera(camera, location, target)
        path = RENDER_DIR / f"{name}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(str(path.relative_to(SCRIPT_DIR)))
    return paths


def export_glb(root: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in descendants(root):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(RAW_GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )


def asset_report(root: bpy.types.Object, render_paths: list[str]) -> dict[str, object]:
    objects = descendants(root)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    triangles = sum(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons) for obj in meshes)
    vertices = sum(len(obj.data.vertices) for obj in meshes)
    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    minimum = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    maximum = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    dimensions = maximum - minimum
    return {
        "generator": "tools/caribbean-sloop/build_sloop.py",
        "blender_version": bpy.app.version_string,
        "design_basis": "Original stylized small Caribbean sailing craft; no external mesh or texture inputs.",
        "forward_axis_blender": "+Y",
        "object_count": len(objects),
        "mesh_count": len(meshes),
        "triangles_before_modifiers": triangles,
        "vertices_before_modifiers": vertices,
        "dimensions_m": {"beam_x": round(dimensions.x, 3), "length_y": round(dimensions.y, 3), "height_z": round(dimensions.z, 3)},
        "objects": [obj.name for obj in objects],
        "materials": sorted({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material}),
        "raw_glb": str(RAW_GLB_PATH.relative_to(SCRIPT_DIR)),
        "raw_glb_bytes": RAW_GLB_PATH.stat().st_size,
        "blend": str(BLEND_PATH.relative_to(SCRIPT_DIR)),
        "renders": render_paths,
    }


def main() -> None:
    reset_scene()
    root = build_ship()
    camera, _ocean = setup_review_scene(root)
    export_glb(root)
    render_paths = render_views(camera)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    report = asset_report(root, render_paths)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
