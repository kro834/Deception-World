"""Closest-triangle barycentric scalar transfer for Blender point fields.

This helper reads source surfaces and writes only explicit scalar attributes.
It does not alter target geometry or project source artwork.
"""
import hashlib
import numpy as np
from mathutils.bvhtree import BVHTree

class TriangleFieldProjector:
    def __init__(self,objects,field_defaults):
        self.names=list(field_defaults)
        self.vertices=[]
        self.triangles=[]
        self.fields={name:[] for name in self.names}
        self.source_counts=[]
        for ob in objects:
            me=ob.data
            me.calc_loop_triangles()
            offset=len(self.vertices)
            self.vertices.extend(ob.matrix_world@v.co for v in me.vertices)
            self.triangles.extend(tuple(offset+i for i in t.vertices) for t in me.loop_triangles)
            for name,default in field_defaults.items():
                attr=me.attributes.get(name)
                if attr:
                    assert attr.domain=='POINT' and attr.data_type=='FLOAT',(ob.name,name)
                    values=np.empty(len(me.vertices),np.float32)
                    attr.data.foreach_get('value',values)
                    self.fields[name].extend(map(float,values))
                else:
                    self.fields[name].extend([default]*len(me.vertices))
            self.source_counts.append({'object':ob.name,'vertices':len(me.vertices),'triangles':len(me.loop_triangles)})
        assert self.triangles
        self.tree=BVHTree.FromPolygons(self.vertices,self.triangles,all_triangles=True)

    def sample(self,point):
        hit,normal,index,distance=self.tree.find_nearest(point)
        assert hit is not None
        ids=self.triangles[index]
        a,b,c=(self.vertices[i] for i in ids)
        ab,ac,ap=b-a,c-a,hit-a
        d00,d01,d11,d20,d21=ab.dot(ab),ab.dot(ac),ac.dot(ac),ap.dot(ab),ap.dot(ac)
        denominator=d00*d11-d01*d01
        if abs(denominator)<1e-22:
            j=min(range(3),key=lambda j:(self.vertices[ids[j]]-hit).length_squared)
            weights=[float(k==j) for k in range(3)]
        else:
            wb=(d11*d20-d01*d21)/denominator
            wc=(d00*d21-d01*d20)/denominator
            weights=[max(0.,1-wb-wc),max(0.,wb),max(0.,wc)]
            total=sum(weights)
            weights=[w/total for w in weights]
        return {name:sum(w*values[i] for w,i in zip(weights,ids)) for name,values in self.fields.items()},distance

    def apply(self,target):
        me=target.data
        fields={name:np.empty(len(me.vertices),np.float32) for name in self.names}
        distances=np.empty(len(me.vertices),np.float32)
        for i,v in enumerate(me.vertices):
            values,distances[i]=self.sample(target.matrix_world@v.co)
            for name in self.names:fields[name][i]=values[name]
        for name,values in fields.items():
            attr=me.attributes.get(name)
            if attr:assert attr.domain=='POINT' and attr.data_type=='FLOAT',name
            else:attr=me.attributes.new(name,'FLOAT','POINT')
            attr.data.foreach_set('value',values)
        return {'targetVertices':len(me.vertices),'sourceObjects':self.source_counts,'distanceMean':float(distances.mean()),'distanceP99':float(np.quantile(distances,.99)),'distanceMax':float(distances.max()),'fields':{name:{'min':float(v.min()),'max':float(v.max()),'sha256':hashlib.sha256(v.tobytes()).hexdigest()} for name,v in fields.items()}}
