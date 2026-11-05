"""Shared helpers for the Aevea concept CAD. CONCEPT ONLY - not production CAD."""
import os, math
import cadquery as cq

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "out")
os.makedirs(OUT, exist_ok=True)


def rrect_tool(w, l, r, depth, taper=0.0, z0=0.0, direction=1, cx=0.0, cy=0.0):
    """Rounded-rectangle prism. taper>0 shrinks with distance from z0 (draft)."""
    s = (cq.Workplane("XY").sketch().rect(w, l).vertices().fillet(r).finalize()
         .extrude(depth, taper=taper))
    if direction < 0:
        s = s.mirror("XY")
    return s.translate((cx, cy, z0))


def prism(build2d, depth, taper=0.0, z0=0.0, direction=1):
    """Generic tool. build2d(wp)->wp with a pending closed wire. taper>0 shrinks
    away from z0 (so a pocket opening at z0 gets draft). direction=-1 extrudes -Z."""
    s = build2d(cq.Workplane("XY")).extrude(depth, taper=taper)
    if direction < 0:
        s = s.mirror("XY")
    return s.translate((0, 0, z0))


def cyl(r, h, z0=0.0, x=0.0, y=0.0, taper=0.0, direction=1):
    return prism(lambda w: w.center(x, y).circle(r), h, taper, z0, direction)


def box(x0, x1, y0, y1, z0, z1):
    return (cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0, centered=False)
            .translate((x0, y0, z0)))


def annulus(r_out, r_in, h, taper=0.0, z0=0.0, direction=1):
    """Drafted annulus: outer shrinks, inner grows with distance from z0."""
    a = cyl(r_out, h, 0, taper=taper)
    b = cyl(r_in, h, 0, taper=-taper)
    s = a.cut(b)
    if direction < 0:
        s = s.mirror("XY")
    return s.translate((0, 0, z0))


def half_shell(w, l, r, depth, wall, floor, draft):
    """Open-top shell, opening at z=0 (parting plane), closed face at z=depth.
    Outer shrinks with z, cavity shrinks with z (both drafted off the parting plane)."""
    outer = rrect_tool(w, l, r, depth, draft)
    cav = rrect_tool(w - 2 * wall, l - 2 * wall, max(r - wall, 0.5), depth - floor, draft)
    return outer.cut(cav)


def to_parting_down(solid, z_parting):
    """Take a shape built with its opening at z=0 and closed face at +z, and
    flip so the opening is at z_parting and the body hangs below it."""
    return solid.mirror("XY").translate((0, 0, z_parting))


def export(name, shape, folder=None):
    """Export STEP + STL into cad/out. shape: Workplane or Shape or Compound."""
    wp = shape if isinstance(shape, cq.Workplane) else cq.Workplane(obj=shape)
    cq.exporters.export(wp, os.path.join(OUT, name + ".step"))
    cq.exporters.export(wp, os.path.join(OUT, name + ".stl"), tolerance=0.05, angularTolerance=0.2)


def volume(wp):
    return sum(s.Volume() for s in wp.solids().vals())


def compound(parts):
    """parts: dict name->Workplane -> cq.Compound with each solid."""
    solids = []
    for p in parts.values():
        solids += p.solids().vals()
    return cq.Compound.makeCompound(solids)
