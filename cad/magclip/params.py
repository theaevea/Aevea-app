"""MagClip params (mm). Frame: nose (contact face) at x=0, y centred, clip bottom at z=0. ALL values ASSUMPTIONS unless noted."""
L, W, H = 40.0, 24.0, 14.0
R_CORNER = 4.0
DRAFT = 1.0            # deg, injection moulded PC/ABS
WALL = 1.6
FLOOR = 1.6
ROOF = 1.6
PART_Z = 7.5           # base/lid parting plane
# contacts: 4 flat gold pads on nose face: power+, power-, data, latch-sense
PAD_NAMES = ["PWR+", "PWR-", "DATA", "LATCH_SENSE"]
PAD_PITCH = 4.5
PAD_W, PAD_H, PAD_DEPTH = 3.0, 2.2, 2.4
PAD_Z = 4.0
PAD_Y = [(-1.5 + i) * PAD_PITCH for i in range(4)]
PAD_SEAL_GROOVE = 0.3  # conformal gasket groove around each pad
# cell
CELL = (22.0, 18.0, 4.2)      # ~100 mAh pouch
CELL_POCKET = (22.8, 18.8, 4.8)
CELL_X0 = 2.8
CELL_Z0 = PART_Z + 0.2
# magnets (guide) in floor
MAG_D, MAG_T = 5.0, 1.5
MAG_POS = [(7.0, -7.0), (7.0, 7.0)]
MAG_Z0 = 0.5
# latch slider
TRAVEL = 2.4
SL_X0, SL_X1 = 12.0, 32.8     # engaged
SL_HALFW = 3.5
SL_Z0, SL_Z1 = 1.8, 5.4
RAIL_Y0, RAIL_Y1 = 3.7, 5.3
SPRING_X0, SPRING_X1, SPRING_D, SPRING_Z = 5.5, 12.0, 4.0, 3.6
HOOK_POST_X0, HOOK_POST_X1 = 19.7, 22.7
HOOK_HALFW = 3.0
HOOK_LIP_LEN = 2.2 + 0.0
HOOK_LIP_X1 = HOOK_POST_X1 + HOOK_LIP_LEN + 0.8   # overhang beyond window edge
HOOK_LIP_Z = (-2.7, -1.7)
FLOOR_SLOT_X = (16.4, 23.0)
FLOOR_SLOT_HALFW = 3.4
CAM_X = (30.4, 32.8)
CAM_H = 1.2
# button
BTN_X = 28.0
BTN_STEM_D = 4.4
BTN_HOLE_D = 4.8
BTN_CAP_D = 7.6
BTN_CAP_PROUD = 1.2
BTN_STROKE = 1.2
# line eye slot (through Z)
EYE_X = (35.0, 37.2)
EYE_HALFW = 8.0
# anchor interface
PLATE_T = 1.5
