import cadquery as cq
from common import *
from magclip import params as P


def build():
    parts = {}
    cx = P.L / 2
    base_h, lid_h = P.PART_Z, P.H - P.PART_Z
    base = to_parting_down(half_shell(P.L, P.W, P.R_CORNER, base_h, P.WALL, P.FLOOR, P.DRAFT), P.PART_Z).translate((cx, 0, 0))
    lid = half_shell(P.L, P.W, P.R_CORNER, lid_h, P.WALL, P.ROOF, P.DRAFT).translate((cx, 0, P.PART_Z))
    # guide rails + spring seat in base
    for s in (-1, 1):
        y0, y1 = (P.RAIL_Y0, P.RAIL_Y1) if s > 0 else (-P.RAIL_Y1, -P.RAIL_Y0)
        base = base.union(box(P.SPRING_X0, 33.0, y0, y1, P.FLOOR - 0.1, 5.8))
    base = base.union(box(4.4, P.SPRING_X0, -P.RAIL_Y1, P.RAIL_Y1, P.FLOOR - 0.1, 5.8))
    # floor slot for hook post
    base = base.cut(box(P.FLOOR_SLOT_X[0], P.FLOOR_SLOT_X[1], -P.FLOOR_SLOT_HALFW, P.FLOOR_SLOT_HALFW, -0.1, P.FLOOR + 0.1))
    # magnet pockets (from inside, drafted)
    mags = {}
    for i, (x, y) in enumerate(P.MAG_POS):
        base = base.cut(cyl(P.MAG_D / 2 + 0.1, P.FLOOR - P.MAG_Z0 + 0.1 + P.MAG_T, P.FLOOR + 0.0, x, y, taper=1, direction=-1).translate((0, 0, 0)))
        mags[f"magnet{i}"] = cyl(P.MAG_D / 2, P.MAG_T, P.MAG_Z0, x, y)
    # contact pad pockets + seal grooves
    pads = {}
    for n, y in zip(P.PAD_NAMES, P.PAD_Y):
        pad = box(0, P.PAD_DEPTH, y - P.PAD_W / 2, y + P.PAD_W / 2, P.PAD_Z - P.PAD_H / 2, P.PAD_Z + P.PAD_H / 2)
        g = P.PAD_SEAL_GROOVE
        ring = box(0, 0.4, y - P.PAD_W / 2 - 2 * g, y + P.PAD_W / 2 + 2 * g, P.PAD_Z - P.PAD_H / 2 - 2 * g, P.PAD_Z + P.PAD_H / 2 + 2 * g).cut(
            box(-1, 1, y - P.PAD_W / 2 - g, y + P.PAD_W / 2 + g, P.PAD_Z - P.PAD_H / 2 - g, P.PAD_Z + P.PAD_H / 2 + g))
        base = base.cut(ring).cut(pad)
        pads["pad_" + n] = pad
    # eye slot through both shells; internal walls already by cavity x end (33.4)->use cavity limit via solid plug
    plug_b = box(33.4 - 0.0, 40, -P.W / 2 + 1, P.W / 2 - 1, P.FLOOR - 0.1, P.PART_Z)
    plug_l = box(33.4, 40, -P.W / 2 + 1, P.W / 2 - 1, P.PART_Z, P.H - P.ROOF + 0.1)
    out_b = to_parting_down(rrect_tool(P.L, P.W, P.R_CORNER, base_h, P.DRAFT), P.PART_Z).translate((cx, 0, 0))
    out_l = rrect_tool(P.L, P.W, P.R_CORNER, lid_h, P.DRAFT).translate((cx, 0, P.PART_Z))
    base = base.union(plug_b.intersect(out_b))
    lid = lid.union(plug_l.intersect(out_l))
    eye = box(P.EYE_X[0], P.EYE_X[1], -P.EYE_HALFW, P.EYE_HALFW, -1, P.H + 1)
    base, lid = base.cut(eye), lid.cut(eye)
    # lid: cell pocket (drafted), button hole
    cw, cl, ch = P.CELL_POCKET[1], P.CELL_POCKET[0], P.CELL_POCKET[2]
    lid = lid.cut(prism(lambda w: w.center(P.CELL_X0 + cl / 2, 0).rect(cl, cw), ch, 1.0, P.PART_Z))
    lid = lid.cut(cyl(P.BTN_HOLE_D / 2, 10, P.H - 3, P.BTN_X, 0))
    # slider with hook, cam
    sl = box(P.SL_X0, P.SL_X1, -P.SL_HALFW, P.SL_HALFW, P.SL_Z0, P.SL_Z1)
    post = box(P.HOOK_POST_X0, P.HOOK_POST_X1, -P.HOOK_HALFW, P.HOOK_HALFW, P.HOOK_LIP_Z[0], P.SL_Z0 + 0.1)
    lip = box(P.HOOK_POST_X1, P.HOOK_LIP_X1, -P.HOOK_HALFW, P.HOOK_HALFW, *P.HOOK_LIP_Z)
    cam = (cq.Workplane("XZ").polyline([(P.CAM_X[0], P.SL_Z1 - 0.1), (P.CAM_X[1], P.SL_Z1 - 0.1), (P.CAM_X[1], P.SL_Z1 + 0.0), (P.CAM_X[0], P.SL_Z1 + P.CAM_H)]).close()
           .extrude(P.SL_HALFW, both=True))
    slider = sl.union(post).union(lip).union(cam)
    # button
    zt = P.H + P.BTN_CAP_PROUD
    btn = cyl(P.BTN_STEM_D / 2, zt - 6.9, 6.9, P.BTN_X, 0).union(cyl(P.BTN_CAP_D / 2, 1.4, zt - 1.4, P.BTN_X, 0))
    # tip chamfer
    spring = (cq.Workplane("YZ").center(0, P.SPRING_Z).circle(P.SPRING_D / 2).extrude(P.SPRING_X1 - P.SPRING_X0).translate((P.SPRING_X0, 0, 0)))
    cell = box(P.CELL_X0 + 0.4, P.CELL_X0 + 0.4 + P.CELL[0], -P.CELL[1] / 2, P.CELL[1] / 2, P.CELL_Z0 + 0.3, P.CELL_Z0 + 0.3 + P.CELL[2])
    parts.update(housing_base=base, housing_lid=lid, latch_slider=slider, release_button=btn,
                 spring=spring, cell_100mAh=cell)
    parts.update(mags); parts.update(pads)
    return parts
