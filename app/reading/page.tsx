import ReadingRoom from "../reading-room";
import SecondaryPageShell from "@/components/SecondaryPageShell";

export default function ReadingPage() {
  return <SecondaryPageShell title="阅读" subtitle="书架、最近在读、笔记与共读"><ReadingRoom section="reading" /></SecondaryPageShell>;
}
