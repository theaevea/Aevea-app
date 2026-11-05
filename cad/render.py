import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from common import OUT
import os
PAL = ["#6c8ebf","#d79b00","#82b366","#b85450","#9673a6","#666666","#d6b656","#23445d","#ae4132","#10739e","#56517e","#8a6d3b"]

def render(parts, fname, views=((25,-60),(90,-90),(0,-90)), title="", section=False):
    fig = plt.figure(figsize=(6*len(views), 6))
    allv = []
    meshes = []
    for i,(k,wp) in enumerate(parts.items()):
        vs, tr = wp.val().tessellate(0.08, 0.3)
        v = np.array([(p.x,p.y,p.z) for p in vs]); t = np.array(tr)
        if len(t)==0: continue
        meshes.append((k, v[t], PAL[i%len(PAL)])); allv.append(v)
    A = np.vstack(allv); c=(A.max(0)+A.min(0))/2; r=(A.max(0)-A.min(0)).max()/2*1.05
    for j,(el,az) in enumerate(views):
        ax = fig.add_subplot(1,len(views),j+1,projection="3d")
        ax.view_init(el,az)
        L = np.array([0.4,-0.5,0.8]); L/=np.linalg.norm(L)
        for k,tri,col in meshes:
            n = np.cross(tri[:,1]-tri[:,0], tri[:,2]-tri[:,0]); n/= (np.linalg.norm(n,axis=1,keepdims=True)+1e-12)
            sh = 0.45+0.55*np.abs(n@L)
            rgb = np.array(matplotlib.colors.to_rgb(col))
            pc = Poly3DCollection(tri, facecolors=np.clip(sh[:,None]*rgb,0,1), edgecolors="none", alpha=0.97)
            ax.add_collection3d(pc)
        ax.set_xlim(c[0]-r,c[0]+r); ax.set_ylim(c[1]-r,c[1]+r); ax.set_zlim(c[2]-r,c[2]+r)
        ax.set_box_aspect((1,1,1)); ax.set_axis_off()
    fig.suptitle(title + "  (CONCEPT CAD, not production)", fontsize=10)
    fig.tight_layout(); fig.savefig(os.path.join(OUT, fname), dpi=80); plt.close(fig)
