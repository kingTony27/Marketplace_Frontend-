"use client";
import { IconArrowNarrowRight } from "@tabler/icons-react";
import { useState, useRef, useId, useEffect } from "react";

interface SlideData {
  title: React.ReactNode;   // was: string
  button?: string;
  src: string;
  subtitle?: React.ReactNode;
  content?: React.ReactNode;
  alt?: string;
}

interface SlideProps {
  slide: SlideData;
  index: number;
  current: number;
  handleSlideClick: (index: number) => void;
  setHovering?: (hovering: boolean) => void;
}

const Slide = ({ slide, index, current, handleSlideClick, setHovering }: SlideProps) => {
  const slideRef = useRef<HTMLLIElement>(null);

  const xRef = useRef(0);
  const yRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const animate = () => {
      if (!slideRef.current) return;

      const x = xRef.current;
      const y = yRef.current;

      slideRef.current.style.setProperty("--x", `${x}px`);
      slideRef.current.style.setProperty("--y", `${y}px`);

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const handleMouseMove = (event: React.MouseEvent) => {
    const el = slideRef.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    xRef.current = event.clientX - (r.left + Math.floor(r.width / 2));
    yRef.current = event.clientY - (r.top + Math.floor(r.height / 2));
  };

 

  const imageLoaded = (event: React.SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.style.opacity = "1";
  };

  const { src, button, title, subtitle, content, alt } = slide;

  return (
    <div className="[perspective:1200px] [transform-style:preserve-3d]">
      <li
        ref={slideRef}
        className="flex flex-1 flex-col items-center justify-center relative text-center text-white opacity-100 transition-all duration-300 ease-in-out w-[var(--slide)] h-[var(--slide)] mx-[var(--gap)] z-10"
        onClick={() => handleSlideClick(index)}
        onMouseMove={handleMouseMove}
        onPointerEnter={(e) => e.pointerType === "mouse" && setHovering?.(true)}
        onPointerLeave={(e) => {
          xRef.current = 0;
          yRef.current = 0;
          if (e.pointerType === "mouse") setHovering?.(false);
        }}

        style={{
          transform:
            current !== index
              ? "scale(0.98) rotateX(8deg)"
              : "scale(1) rotateX(0deg)",
          transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          transformOrigin: "bottom",
        }}
      >
        <div
          className="absolute top-0 left-0 w-full h-full bg-[#1D1F2F] rounded-[1%] overflow-hidden transition-all duration-150 ease-out"
          style={{
            transform:
              current === index
                ? "translate3d(calc(var(--x) / 30), calc(var(--y) / 30), 0)"
                : "none",
          }}
        >
          <img
            className="absolute inset-0 w-[120%] h-[120%] object-cover opacity-100 transition-opacity duration-600 ease-in-out"
            style={{
              opacity: current === index ? 1 : 0.5,
            }}
            alt={alt ?? ""}
            src={src}
            onLoad={imageLoaded}
            loading="eager"
            decoding="sync"
          />
          {current === index && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-all duration-1000" />
          )}
        </div>

        <article
          className={`relative p-[4vmin]  transition-opacity duration-1000 ease-in-out ${
            current === index ? "opacity-100 visible" : "opacity-0 invisible"
          }`}
        >
          <h2 className="text-lg md:text-2xl lg:text-4xl font-semibold relative">
            {title}
          </h2>
          {subtitle && (
            <div className="mt-2 text-sm sm:text-base">{subtitle}</div>
          )}
          {content && <div className="mt-4 sm:mt-6">{content}</div>}
          {button && (
            <div className="flex justify-center">
              <button className="mt-6 px-4 py-2 w-fit mx-auto sm:text-sm text-black bg-white h-12 border border-transparent text-xs flex justify-center items-center rounded-2xl hover:shadow-lg transition duration-200 shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)]">
                {button}
              </button>
            </div>
          )}
        </article>
      </li>
    </div>
  );
};

interface CarouselControlProps {
  type: string;
  title: string;
  handleClick: () => void;
  position?: "left" | "right" | "bottom";
}

const CarouselControl = ({
  type,
  title,
  handleClick,
  position = "bottom",
}: CarouselControlProps) => {
  const sideClasses =
    position === "left" || position === "right"
      ? "absolute top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-12 sm:h-12 bg-zinc-800 border border-white/25 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
      : "relative mx-2 w-10 h-10 bg-neutral-200 dark:bg-neutral-800 border-3 border-transparent focus:border-[#6D64F7] focus:outline-none";

  return (
    <button
      className={`flex items-center justify-center rounded-full hover:-translate-y-0.5 active:translate-y-0.5 transition-all duration-200 ${
        sideClasses
      } ${position === "left" ? "left-0" : ""} ${
        position === "right" ? "right-0" : ""
      }`}
      title={title}
      aria-label={title}
      onClick={handleClick}
    >
      <IconArrowNarrowRight
        className={`transition-transform duration-200 ${
          type === "previous" ? "rotate-180" : ""
        } ${
          position === "left" || position === "right"
            ? "text-white h-5 w-5 sm:h-6 sm:w-6"
            : "text-neutral-600 dark:text-neutral-200"
        }`}
      />
    </button>
  );
};

interface CarouselProps {
  slides: SlideData[];
  autoplayMs?: number;
}

export default function Carousel({ slides, autoplayMs = 4000 }: CarouselProps) {
  const [current, setCurrent] = useState(0);
  const [hovering, setHovering] = useState(false);
  const touchStartX = useRef<number | null>(null); 

  const handlePreviousClick = () => {
    const previous = current - 1;
    setCurrent(previous < 0 ? slides.length - 1 : previous);
  };

  const handleNextClick = () => {
    const next = current + 1;
    setCurrent(next === slides.length ? 0 : next);
  };

  const handleSlideClick = (index: number) => {
    if (current !== index) {
      setCurrent(index);
    }
  };

  const id = useId();

  useEffect(() => {
    if (!autoplayMs || autoplayMs <= 0) return;
    if (hovering) return;
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrent((c) => (c + 1 === slides.length ? 0 : c + 1));
    }, autoplayMs);
    return () => window.clearInterval(timer);
  }, [autoplayMs, hovering, slides.length]);

  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={
        {
          "--slide": "clamp(14rem, 70vmin, 40rem)", // min, preferred, max
          "--gap": "calc(var(--slide) * 0.06)",
          width: "calc(var(--slide) + 2 * var(--gap))",
        } as React.CSSProperties
      }
      role="region"
      aria-label="Featured collections"
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
    >
      <CarouselControl
        type="previous"
        title="Go to previous slide"
        handleClick={handlePreviousClick}
        position="left"
      />

      <div
        className="relative"
        style={{ width: "var(--slide)", height: "var(--slide)" }}
      >
        <ul
          className="absolute flex transition-transform duration-1000 ease-in-out"
          style={{
            marginInline: "calc(var(--gap) * -1)",
            transform: `translateX(-${current * (100 / slides.length)}%)`,
          }}
        >
          {slides.map((slide, index) => (
            <Slide
              key={index}
              slide={slide}
              index={index}
              current={current}
              handleSlideClick={handleSlideClick}
              setHovering={setHovering}
            />
          ))}
        </ul>
      </div>

      <CarouselControl
        type="next"
        title="Go to next slide"
        handleClick={handleNextClick}
        position="right"
      />
    </div>
  );
}
