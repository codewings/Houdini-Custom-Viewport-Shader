#version 330

layout(triangles) in;
layout(triangle_strip, max_vertices=3) out;

#define ATTRS        \
    vec4  pos;       \
    vec3  normal;    \
    vec4  color;     \
    vec2  texcoord0; \
    vec2  texcoord2; \
    float selected;

in parms {
    ATTRS
} gsIn[];

out wparms {
    ATTRS
    noperspective out vec3 edgedist;
    flat out int edgeflags;
} gsOut;

#if defined(VENDOR_NVIDIA) && DRIVER_MAJOR >= 343
  in gl_PerVertex {
      vec4  gl_Position;
      float gl_ClipDistance[2];
  } gl_in[];
  out gl_PerVertex {
      vec4  gl_Position;
      float gl_ClipDistance[2];
  };
#endif

uniform int	attrmodeN;
uniform int	attrmodeCd;
uniform int	attrmodeuv;
uniform int	attrmodeuv2;
uniform int	attrmodeAlpha;

uniform samplerBuffer attrN;
uniform samplerBuffer attrCd;
uniform samplerBuffer attruv;
uniform samplerBuffer attruv2;
uniform samplerBuffer attrAlpha;

uniform int  glH_SelectMode;
uniform mat4 glH_ObjectMatrix;
uniform mat3 glH_NormalMatrix;
uniform int	 glH_WireOver;
uniform int  glH_LightingEnabled;

#using glH_Material

vec3 HOUedgeDistance(vec4 v0, vec4 v1, vec4 v2, out int edges);
int  HOUprimitiveInfo(out ivec3 vertex);
bool HOUfrustumCull(vec4 v0, vec4 v1, vec4 v2);
bool HOUprimSelection();

vec3 TransformNormal(vec3 n)
{
    return normalize(glH_NormalMatrix * (glH_ObjectMatrix * vec4(n,0.0)).xyz);
}

void Submit(int index, int prim, int vert, bool prim_selected, bvec4 ptuv, vec3 dist, int edgeflags)
{
    switch(attrmodeN)
    {
        case 1:  // prim
            gsOut.normal = TransformNormal(texelFetch(attrN, prim).xyz);
            break;
        case 2:  // vertex
            gsOut.normal = TransformNormal(texelFetch(attrN, vert).xyz);
            break;
        default: // point
            gsOut.normal = gsIn[index].normal;
            break;
    }

    switch(attrmodeCd)
    {
        case 1:
            gsOut.color.rgb = texelFetch(attrCd, prim).rgb;
            break;
        case 2:
            gsOut.color.rgb = texelFetch(attrCd, vert).rgb;
            break;
        default:
            gsOut.color = gsIn[index].color;
            break;
    }
    
    switch(attrmodeAlpha)
    {
        case 1:
            gsOut.color.a = texelFetch(attrAlpha, prim).r;
            break;
        case 2:
            gsOut.color.a = texelFetch(attrAlpha, vert).r;
            break;
        default:
            break;
    }

    const vec3 EDGE_DISTMASK[3] = vec3[](vec3( 1.0, 0.0, 0.0 ),
                                         vec3( 0.0, 1.0, 0.0 ),
                                         vec3( 0.0, 0.0, 1.0 ));

    gsOut.texcoord0 = (ptuv.x) ? gsIn[index].texcoord0 : texelFetch(attruv,  vert).rg;
    gsOut.texcoord2 = (ptuv.y) ? gsIn[index].texcoord2 : texelFetch(attruv2, vert).rg;

    gsOut.pos       = gsIn[index].pos;
    gsOut.selected  = prim_selected ? 1.0 : gsIn[index].selected;
    gsOut.edgedist  = dist * EDGE_DISTMASK[index];
    gsOut.edgeflags = edgeflags;

    gl_Position        = gl_in[index].gl_Position;
    gl_ClipDistance[0] = gl_in[index].gl_ClipDistance[0];
    gl_ClipDistance[1] = gl_in[index].gl_ClipDistance[1];

    EmitVertex();
}

void main()
{
    ivec3 vertex;

    // quick frustum cull
    if(HOUfrustumCull(gl_in[0].gl_Position, gl_in[1].gl_Position, gl_in[2].gl_Position))
       return;
    
    vec3 dist = vec3(0);
    int  edgeflags = 0;
    if(glH_WireOver == 1)
    {
        dist = HOUedgeDistance(gl_in[0].gl_Position, gl_in[1].gl_Position, gl_in[2].gl_Position, edgeflags);
    }

    bool prim_selected = HOUprimSelection();
    if(prim_selected)
        dist.xyz *= 0.8;

    int   prim = HOUprimitiveInfo(vertex);
    bvec4 ptuv = bvec4((attrmodeuv == 0 || !has_textures), (attrmodeuv2 == 0 || !has_textures), false, false);

    Submit(0, prim, vertex.r, prim_selected, ptuv, dist, edgeflags);
    Submit(1, prim, vertex.g, prim_selected, ptuv, dist, edgeflags);
    Submit(2, prim, vertex.b, prim_selected, ptuv, dist, edgeflags);

    EndPrimitive();
}
