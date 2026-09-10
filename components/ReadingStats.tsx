"use client";

import { BookHeart, MessageCircleHeart, NotebookPen } from "lucide-react";
import { useEffect, useState } from "react";
import { getMonthlyStats, rememberReadingDay } from "@/lib/local-reading";

export default function ReadingStats() {
  const [stats, setStats] = useState({ readingDays: 0, noteCount: 0, coReadCount: 0 });

  useEffect(() => {
    const refresh = () => setStats(getMonthlyStats());
    rememberReadingDay();
    refresh();
    window.addEventListener("reading-room:local-state-changed", refresh);
    return () => window.removeEventListener("reading-room:local-state-changed", refresh);
  }, []);

  return (
    <section className="reading-stats" aria-label="本月温和阅读记录">
      <div><BookHeart size={18} /><span><strong>{stats.readingDays}</strong> 天</span><small>本月读过或共读</small></div>
      <div><NotebookPen size={18} /><span><strong>{stats.noteCount}</strong> 条</span><small>已同步书籍的新笔记</small></div>
      <div><MessageCircleHeart size={18} /><span><strong>{stats.coReadCount}</strong> 次</span><small>本机共读</small></div>
      <p>这是本机的温和记录，不是打卡；微信读书原始数据仍由微信读书提供。</p>
    </section>
  );
}
