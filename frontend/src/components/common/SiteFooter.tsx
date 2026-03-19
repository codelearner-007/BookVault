import React from 'react';
import Link from 'next/link';
import { Github, Linkedin } from 'lucide-react';

export function SiteFooter() {
  const productName = process.env.NEXT_PUBLIC_PRODUCTNAME || 'SaaS Starter';

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <Link href="/">
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {productName}
              </span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground max-w-xs">
              A production-ready SaaS starter template built with Next.js,
              FastAPI, and Supabase.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">Product</h4>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/#features"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="/#tech-stack"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Tech Stack
                </Link>
              </li>
              <li>
                <Link
                  href="/#architecture"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Architecture
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">Legal</h4>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} {productName}. All rights
            reserved.
          </p>
          <div className="flex items-center space-x-4">
            <Link
              href="https://github.com/code-by-muhammad"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </Link>
            <Link
              href="https://www.linkedin.com/in/arham-amir-a1m/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
