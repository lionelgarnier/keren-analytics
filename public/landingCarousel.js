// Hero product walkthrough carousel (landing page).
// Crossfades through the config -> dashboard story. No deps, CSP-safe (no inline).
(() => {
  const root = document.getElementById("lv2HeroCarousel")
  if (!root) return

  const slides = Array.from(root.querySelectorAll(".lv2-carousel-slide"))
  const dots = Array.from(root.querySelectorAll(".lv2-carousel-dot"))
  if (slides.length < 2) return

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const INTERVAL = 3800
  let current = 0
  let timer = null

  function show(i) {
    current = (i + slides.length) % slides.length
    slides.forEach((s, idx) => s.classList.toggle("is-active", idx === current))
    dots.forEach((d, idx) => {
      const active = idx === current
      d.classList.toggle("is-active", active)
      d.setAttribute("aria-selected", active ? "true" : "false")
    })
  }

  function start() {
    if (reduceMotion || timer) return
    timer = window.setInterval(() => show(current + 1), INTERVAL)
  }

  function stop() {
    if (timer) {
      window.clearInterval(timer)
      timer = null
    }
  }

  dots.forEach((d) => {
    d.addEventListener("click", () => {
      stop()
      show(Number(d.dataset.goto) || 0)
      start()
    })
  })

  root.addEventListener("mouseenter", stop)
  root.addEventListener("mouseleave", start)
  root.addEventListener("focusin", stop)
  root.addEventListener("focusout", start)

  // Only autoplay while the carousel is actually on screen (and the landing
  // section is visible — it starts hidden until the session check resolves).
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
      { threshold: 0.25 }
    )
    io.observe(root)
  } else {
    start()
  }
})()
