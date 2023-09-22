#version 330

struct gbfv_light {
    vec4  dp; // (direciton/position, point?)
    vec3  atten;
    vec2  radius;
    float normal_atten;
    vec3  falloff;
};

in wparms {
    vec4  pos;
    vec3  normal;
    vec4  color;
    vec2  texcoord0;
    vec2  texcoord2;
    float selected;
    noperspective in vec3 edgedist;
    flat in int edgeflags;
} fsIn;

#using glH_Material

uniform mat4 glH_ViewMatrix;
uniform mat3 glH_NormalMatrix;
uniform int  glH_LightMask;
uniform int  glH_LightingEnabled;
uniform int  glH_MaterialPass;
uniform int  glH_WireOver;

#define LIGHTING(i, L) \
    if((glH_LightMask & (1 << i)) != 0)     \
    {                                       \
        gbfv_light light;                   \
        light.dp.xyz = L.point ? (glH_ViewMatrix * vec4(L.pos, 1.0)).xyz - P : glH_NormalMatrix * (-L.dir); \
        light.dp.w   = L.point ? 1.0 : 0.0; \
        result      += L.diff * gbfv_lighting(light, N, V, ilm, IllumControl, AmbientColor, DiffuseColor, HighlitColor, albedocolor, shadowcolor, detail); \
    }

#define LIGHT_DATA(STRUCTNAME, INSTNAME)\
    layout(std140) uniform STRUCTNAME   \
    {					                \
        vec3	pos;				    \
        vec3	dir;				    \
        vec3	atten;				    \
        vec3	amb;				    \
        vec3	spec;				    \
        vec3	diff;				    \
        vec2	active_radius;		    \
        float   normal_atten;           \
        float	coscutoff;			    \
        float	cosfalloff;			    \
        float   spotrolloff;            \
        bool	point;				    \
    } INSTNAME
LIGHT_DATA(glH_Light0, lightSource0);
LIGHT_DATA(glH_Light1, lightSource1);
LIGHT_DATA(glH_Light2, lightSource2);
LIGHT_DATA(glH_Light3, lightSource3);
#ifndef REDUCED_LIGHTS
LIGHT_DATA(glH_Light4, lightSource4);
LIGHT_DATA(glH_Light5, lightSource5);
LIGHT_DATA(glH_Light6, lightSource6);
LIGHT_DATA(glH_Light7, lightSource7);
LIGHT_DATA(glH_Light8, lightSource8);
LIGHT_DATA(glH_Light9, lightSource9);
#endif


vec3 HOUapplyNormalMap(vec3 P, vec3 N, vec2 uv, bool use_tangent, vec3 tangent, vec3 bitangent);
vec3 HOUfrontFacing(vec3 n, vec3 p);
vec4 HOUwireColor(vec3 edges, int edgeflags, float selected);
void HOUassignUnlitOutput(vec3 point_color, vec3 unlit_color, vec4 wire, float alpha, float selected);

uniform int       ogl_use_tex1; // albedo
uniform sampler2D ogl_tex1;
uniform int       ogl_use_tex2; // shadow
uniform sampler2D ogl_tex2;
uniform int       ogl_use_tex3; // ILM
uniform sampler2D ogl_tex3;
uniform int       ogl_use_tex4; // detail
uniform sampler2D ogl_tex4;

uniform vec4      ogl_albedocolor;
uniform vec4      ogl_shadowcolor;
uniform vec4      ogl_rimshadowtint;


float saturate(float v) { return clamp(v, 0, 1);             }
vec2  saturate(vec2  v) { return clamp(v, vec2(0), vec2(1)); }
vec3  saturate(vec3  v) { return clamp(v, vec3(0), vec3(1)); }
vec4  saturate(vec4  v) { return clamp(v, vec4(0), vec4(1)); }


vec3 gbfv_lighting(gbfv_light light, vec3 N, vec3 V, vec4 IlmTex, vec4 IllumControl, vec3 AmbientColor, vec3 DiffuseColor, vec3 HighlitColor, vec4 Albedo, vec4 Shadow, vec4 Detail)
{
    vec3 L = normalize(light.dp.xyz);

    vec4 NoL = vec4(0);
    {
        float A = (dot(N, L) + 1) * IllumControl.a;
        float B = IlmTex.g * 2 - 1;
        float C = A * 0.5 + B;
        float D = C >= 0.5 ? 1 : 0;
        float E = Albedo.a > 0.00001 ? 1 : 0;
        NoL = vec4(C, B, D, E);
    }

    vec4 NoV = vec4(0);
    {
        NoV = (1 + dot(N, V)) * vec4(1, 0.45, 1, 1);
        NoV.zw = NoV.zw * vec2(0.5, 0.5) - vec2(0.6, 0.5);
        NoV.zw = saturate(NoV.zw * vec2(20.000019, 2.222222));
        NoV.zw = vec2(1, 1) - (NoV.zw * NoV.zw * (3 - 2 * NoV.zw));
    }

    vec3 Rim = NoV.zzz * Albedo.aaa;

    // diffuse + rim highlighting
    vec4 Lighting = vec4(0, 0, 0, saturate((NoL.z * IllumControl.r + NoV.z * NoL.w) * IllumControl.r));
    Lighting.rgb = Lighting.www * (DiffuseColor.rgb - AmbientColor.rgb) + AmbientColor.rgb;
    {
        Lighting.w = NoV.x >= 1.6 ? 1 : 0;
        Lighting.w = (NoL.z * IllumControl.r + Lighting.w - NoL.w + 1) * IllumControl.g;
        Lighting.w = Lighting.w * ((NoL.x + NoL.y) >= -0.75 ? 1 : 0) + NoV.z;
        Lighting.w = clamp(IllumControl.g * Lighting.w, -1, 1);
    }
    Lighting.rgb = (Lighting.www * vec3(0.2, 0.25, 0.2) + vec3(0.8, 0.75, 0.8)) * (IllumControl.rrr * Rim * HighlitColor.rgb * vec3(Albedo.a * 0.7) + Lighting.rgb);

    // rim shadow
    vec3 RimShadow = ((ogl_rimshadowtint.rgb - Shadow.rgb) * 0.7 + Shadow.rgb) * Shadow.aaa;
    RimShadow = (Shadow.a > 0) ? RimShadow - 1 : vec3(0, 0, 0);
    RimShadow = saturate(Shadow.aaa * NoV.www - Rim * IllumControl.rrr) * RimShadow + 1;

    // specular
    vec2 Shiness = vec2(0.998, 1) - IlmTex.bb * vec2(0.25, 0.25);
    float NoH = NoL.x * 0.1 + NoV.y;
    NoH = saturate((NoH - Shiness.y) / (saturate(Shiness.x) - Shiness.y));
    NoH = 1 - (NoH * NoH * (3 - 2 * NoH));
    vec3 Specular = IlmTex.b > 0 ? vec3(0.6 * NoH) * IlmTex.rrr * HighlitColor : vec3(0);

    // combine lighting
    Lighting.rgb = clamp(Lighting.rgb * RimShadow + Specular, vec3(-1), vec3(1.1));

    // combine lighting with stoke line/stretch line
    vec3 Stroke = mix(Albedo.rgb * vec3(0.2), vec3(1), IlmTex.a);
    Lighting.rgb = mix(vec3(1), Detail.rgb + Albedo.rgb * vec3(0.2) - Detail.rgb * Albedo.rgb * vec3(0.2), IllumControl.b) * (Stroke * Stroke) * Lighting.rgb;

    return vec3(pow(Lighting.rgb, vec3(2.2)));
}

void main()
{
    vec3 N = fsIn.normal;
    vec3 P = fsIn.pos.xyz / fsIn.pos.w;
    vec3 ptcol = vec3(1, 1, 1); // fsIn.color.rgb * fsIn.color.a;
    vec3 V = normalize(-P);

    // if(has_normal_map)
    //	N = HOUapplyNormalMap(P, N, fsIn.texcoord0, false, vec3(0.0), vec3(0.0));
    N = normalize(HOUfrontFacing(N, P));

    vec4 albedocolor = vec4(1.0, 1.0, 1.0, 1.0);
    if (ogl_use_tex1 == 1)
    {
        albedocolor = texture(ogl_tex1, fsIn.texcoord0.xy);
    }
    
    vec4 wire = HOUwireColor(fsIn.edgedist, fsIn.edgeflags, fsIn.selected);
    if (glH_LightingEnabled == 0)
    {
        HOUassignUnlitOutput(ptcol, albedocolor.rgb * (1 - wire.aaa), wire, 1, fsIn.selected);
        return;
    }

    vec4 shadowcolor = vec4(0.5, 0.5, 0.5, 1.0);
    if (ogl_use_tex2 == 1)
    {
        shadowcolor = texture(ogl_tex2, fsIn.texcoord0.xy);
    }

    vec4 ilm = vec4(0.0, 0.5, 0.0, 1.0);
    if (ogl_use_tex3 == 1)
    {
        ilm = texture(ogl_tex3, fsIn.texcoord0.xy);
    }

    vec4 detail = vec4(1);
    if (ogl_use_tex4 == 1)
    {
        detail = texture(ogl_tex4, fsIn.texcoord2.xy);
        detail.rgb = pow(detail.rgb, vec3(1/2.2));
    }

    vec4 IllumControl = vec4(fsIn.color.a >= 0.5 ? 1 : 0, fsIn.color.a >= 0.1 ? 1 : 0, 1, fsIn.color.a);
    vec3 AmbientColor = ogl_shadowcolor.rgb * shadowcolor.rgb * vec3(2.0);
    vec3 DiffuseColor = ogl_albedocolor.rgb * albedocolor.rgb * vec3(2.0);
    vec3 HighlitColor = mix(vec3(1, 1, 0.7), albedocolor.rgb, 0.5);

    vec3 result = vec3(0);
    LIGHTING(0, lightSource0);
    /*
    LIGHTING(1, lightSource1);
    LIGHTING(2, lightSource2);
    LIGHTING(3, lightSource3);
    #ifndef REDUCED_LIGHTS
    LIGHTING(4, lightSource4);
    LIGHTING(5, lightSource5);
    LIGHTING(6, lightSource6);
    LIGHTING(7, lightSource7);
    LIGHTING(8, lightSource8);
    LIGHTING(9, lightSource9);
    #endif
    */
    HOUassignUnlitOutput(ptcol, result * (1 - wire.aaa), wire, 1, fsIn.selected);
}