#version 330

#ifdef GL_ARB_explicit_attrib_location
  #extension GL_ARB_explicit_attrib_location : require
  #define VERTEX_INPUT(i, type, name) layout(location=i) in type name
#else
  #define VERTEX_INPUT(i, type, name) in type name
#endif

VERTEX_INPUT(0, vec3,  P);
VERTEX_INPUT(1, vec3,  Cd);
VERTEX_INPUT(2, float, Alpha);
VERTEX_INPUT(3, vec3,  N);
VERTEX_INPUT(4, vec2,  uv);
VERTEX_INPUT(5, vec2,  uv2);
VERTEX_INPUT(6, uint,  pointSelection);

#using glH_Material

out parms {
    vec4  pos;
    vec3  normal;
    vec4  color;
    vec2  texcoord0;
    vec2  texcoord2;
    float selected;
} vsOut;

#if defined(VENDOR_NVIDIA) && DRIVER_MAJOR >= 343
out gl_PerVertex {
    vec4  gl_Position;
    float gl_ClipDistance[2];
};
#endif

uniform mat4 glH_ProjectMatrix;
uniform mat4 glH_ObjectMatrix;
uniform mat4 glH_ObjViewMatrix;
uniform mat3 glH_NormalMatrix;
uniform vec2 glH_DepthRange;

float HOUpointSelection(uint point_attrib, int instance_id);
mat4  HOUfetchInstance(out vec3 Cd, out float texlayer, out int instID, out bool has_cd, out bool is_selected);

void main()
{
    vec3  instCd;
    float texlayer;
    int   instID;
    bool  isSel, hasCd;
    mat4  xformPerInstance = HOUfetchInstance(instCd, texlayer, instID, hasCd, isSel);

    // Object transform and instancing transform
    mat3 xformPerInstanceNormal = mat3(glH_ObjectMatrix * xformPerInstance);
    xformPerInstanceNormal = transpose( inverse( xformPerInstanceNormal ));

    // view position
    vec4 vpos = vec4(P, 1.0);
    vpos = glH_ObjViewMatrix * (xformPerInstance * vpos);
    
    vsOut.pos   = vpos / vpos.w;
    vsOut.color = vec4(Cd * instCd, Alpha);

    // Point UVs
    if(has_textures)
    {
        vsOut.texcoord0 = uv;
        vsOut.texcoord2 = uv2;
    }
    else
    {
        vsOut.texcoord0 = vec2(0.0);
        vsOut.texcoord2 = vec2(0.0);
    }

    vsOut.selected = isSel ? 1.0 : HOUpointSelection(pointSelection, instID);

    // Adjust normals if object/instance transform flips them
    vsOut.normal = glH_NormalMatrix * (xformPerInstanceNormal * N) * sign(determinant(xformPerInstanceNormal));
    if(all(equal(vsOut.normal.xyz, vec3(0.0))))
        vsOut.normal.z = -1.0;
    
    // projected position
    gl_Position = glH_ProjectMatrix * vpos;

    // near/far clip, in case zbuffer near/far are different
    gl_ClipDistance[0] = -vsOut.pos.z - glH_DepthRange.x;
    gl_ClipDistance[1] = glH_DepthRange.y + vsOut.pos.z;
}
