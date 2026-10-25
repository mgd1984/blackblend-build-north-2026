export const studioExamples = [
  {
    id: "woodshed",
    title: "Woodshed",
    subtitle: "Assembly study",
    source: "/media/woodshed-hero-source.mp4",
    result: "/media/woodshed-hero-result.mp4",
    prompt:
      "Refine the woodshed's materials and lighting. Preserve the native camera, assembly sequence, component positions and timing. Compare the result carefully against the source.",
  },
  {
    id: "ptz",
    title: "PTZ camera rig",
    subtitle: "Mechanical assembly",
    source: "/media/ptz-compare-source.mp4",
    result: "/media/ptz-compare-result.mp4",
    prompt:
      "Create a polished product treatment of this PTZ camera assembly. Preserve the native motion, part relationships and assembly sequence. Compare critical geometry against the Blender source.",
  },
  {
    id: "massey-harris-21",
    title: "Massey-Harris 21",
    subtitle: "Seven-system assembly",
    source: "/media/massey-harris-21-source.mp4",
    result: "/media/massey-harris-21-result.mp4",
    prompt:
      "Render this Massey-Harris Model 21 with red painted steel, wooden reel bats, tan canvas drapers, rubber tyres and exposed mechanisms. Preserve the source component relationships and assembly choreography. Review any changes to geometry or motion against the native source.",
  },
] as const;
export type StudioExampleId = (typeof studioExamples)[number]["id"];
