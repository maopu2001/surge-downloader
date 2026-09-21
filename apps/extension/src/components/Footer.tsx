import React from "react";
import { Globe, ExternalLink } from "lucide-react";
import { GithubIcon } from "../utils/GithubIcon.js";
import { AUTHOR_CONFIG } from "../utils/author.js";

interface FooterProps {
  maxWidth?: "max-w-6xl" | "max-w-4xl" | "max-w-5xl";
}

export function Footer({ maxWidth = "max-w-6xl" }: FooterProps) {
  return (
    <footer className="border-t border-zinc-200/80 dark:border-zinc-800/80 bg-white/50 dark:bg-[#121215]/50 backdrop-blur-xs py-4 px-6 mt-auto">
      <div
        className={`${maxWidth} mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400`}
      >
        <div className="flex items-center space-x-1.5">
          <span>Built by</span>
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
            {AUTHOR_CONFIG.name}
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <a
            href={AUTHOR_CONFIG.github}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <GithubIcon className="w-3.5 h-3.5" />
            <span>GitHub</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>

          <span className="text-zinc-300 dark:text-zinc-700">•</span>

          <a
            href={AUTHOR_CONFIG.portfolio}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Portfolio</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>
        </div>
      </div>
    </footer>
  );
}
