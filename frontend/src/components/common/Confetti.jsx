"use client";

import React, { useEffect, useRef, useState } from 'react';

export default function Confetti({ active }) {
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);
  const particles = useRef([]);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (!canvasRef.current) return;
    if (viewport.w === 0 || viewport.h === 0) return;

    const canvas = canvasRef.current;
    canvas.width = viewport.w;
    canvas.height = viewport.h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Note: confetti colors are intentionally vivid; if we later add theming,
    // we can source these from CSS variables.
    const colors = ['#ffd700', '#ff0000', '#00ff00', '#0000ff', '#ff00ff'];

    particles.current = Array.from({ length: 50 }, () => ({
      x: canvas.width / 2,
      y: canvas.height / 2,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedX: (Math.random() - 0.5) * 12,
      speedY: -Math.random() * 15 - 5,
      gravity: 0.7,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 8,
    }));

    let frame = 0;
    const maxFrames = 120;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.current.forEach((particle) => {
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate((particle.rotation * Math.PI) / 180);

        ctx.fillStyle = particle.color;
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);

        ctx.restore();

        particle.x += particle.speedX;
        particle.y += particle.speedY;
        particle.speedY += particle.gravity;
        particle.rotation += particle.rotationSpeed;
      });

      frame += 1;
      if (frame < maxFrames) {
        animationFrameId.current = requestAnimationFrame(animate);
      }
    };

    animate();

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [active, viewport.h, viewport.w]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      aria-hidden="true"
    />
  );
}
