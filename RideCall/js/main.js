// ===== Ride Call Landing Page JavaScript =====

document.addEventListener("DOMContentLoaded", () => {
  initNavbar();
  initScrollAnimations();
  initStickyPhoneFeatures();
  initMobileMenu();
  initSmoothScroll();
  initInteractivePhone();
});

// ===== Navbar Scroll Effect =====
function initNavbar() {
  const navbar = document.querySelector(".navbar");

  window.addEventListener("scroll", () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 50) {
      navbar.classList.add("scrolled");
    } else {
      navbar.classList.remove("scrolled");
    }
  });
}

// ===== Scroll-Triggered Animations =====
function initScrollAnimations() {
  const animatedElements = document.querySelectorAll(".animate-on-scroll");

  const observerOptions = {
    root: null,
    rootMargin: "0px 0px -100px 0px",
    threshold: 0.1,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // Add staggered delay for grid items
        const parent = entry.target.parentElement;
        if (
          parent &&
          (parent.classList.contains("persona-grid") ||
            parent.classList.contains("steps-horizontal"))
        ) {
          const siblings = Array.from(parent.children).filter(
            (el) =>
              el.classList.contains("animate-on-scroll") ||
              el.classList.contains("step-h"),
          );
          const itemIndex = siblings.indexOf(entry.target);
          entry.target.style.transitionDelay = `${itemIndex * 0.1}s`;
        }

        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  animatedElements.forEach((el) => observer.observe(el));
}

// ===== Sticky Phone with Screen Transitions =====
function initStickyPhoneFeatures() {
  const featureCards = document.querySelectorAll(".feature-card-scroll");
  const screenContents = document.querySelectorAll(".phone-screen-content");

  if (featureCards.length === 0 || screenContents.length === 0) return;

  // Check if mobile
  const isMobile = () => window.innerWidth <= 1024;

  // Get appropriate root margin based on screen size
  const getRootMargin = () => {
    if (isMobile()) {
      return "-300px 0px -30% 0px";
    }
    return "-40% 0px -40% 0px";
  };

  let observer;
  let currentActiveCard = null;

  // Get Lottie players for a card
  const getLottiePlayers = (card) => {
    const screenNum = card.getAttribute("data-screen");
    const desktopLottie = document.querySelector(
      `.screen-${screenNum} lottie-player`,
    );
    const mobileLottie = card.querySelector(".mobile-lottie");
    return [desktopLottie, mobileLottie].filter(Boolean);
  };

  // Start Lottie animation from beginning when card comes into focus
  const startLottieAnimation = (card) => {
    const players = getLottiePlayers(card);
    players.forEach((lottie) => {
      if (lottie && lottie.stop && lottie.play) {
        lottie.stop();
        lottie.play();
      }
    });
  };

  // Stop Lottie animation when card loses focus
  const stopLottieAnimation = (card) => {
    const players = getLottiePlayers(card);
    players.forEach((lottie) => {
      if (lottie && lottie.stop) {
        lottie.stop();
      }
    });
  };

  const createObserver = () => {
    if (observer) {
      observer.disconnect();
    }

    const observerOptions = {
      root: null,
      rootMargin: getRootMargin(),
      threshold: 0,
    };

    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const screenNum = entry.target.getAttribute("data-screen");

          // Stop animation on previous card
          if (currentActiveCard && currentActiveCard !== entry.target) {
            stopLottieAnimation(currentActiveCard);
          }

          // Update active feature card
          featureCards.forEach((card) => card.classList.remove("active"));
          entry.target.classList.add("active");
          currentActiveCard = entry.target;

          // Update active screen
          screenContents.forEach((screen) => screen.classList.remove("active"));
          const targetScreen = document.querySelector(`.screen-${screenNum}`);
          if (targetScreen) {
            targetScreen.classList.add("active");
          }

          // Start Lottie animation for the new active card
          startLottieAnimation(entry.target);
        }
      });
    }, observerOptions);

    featureCards.forEach((card) => observer.observe(card));
  };

  // Create initial observer
  createObserver();

  // Recreate observer on resize (debounced)
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      createObserver();
    }, 250);
  });

  // Set first card as active initially
  if (featureCards.length > 0) {
    featureCards[0].classList.add("active");
    currentActiveCard = featureCards[0];

    // Start animation when first card becomes visible
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            startLottieAnimation(featureCards[0]);
            visibilityObserver.disconnect();
          }
        });
      },
      { threshold: 0.1 },
    );
    visibilityObserver.observe(featureCards[0]);
  }
}

// ===== Mobile Menu =====
function initMobileMenu() {
  const menuBtn = document.querySelector(".mobile-menu-btn");
  const navLinks = document.querySelector(".nav-links");

  if (!menuBtn || !navLinks) return;

  menuBtn.addEventListener("click", () => {
    navLinks.classList.toggle("active");
    menuBtn.classList.toggle("active");

    // Animate hamburger to X
    const spans = menuBtn.querySelectorAll("span");
    if (menuBtn.classList.contains("active")) {
      spans[0].style.transform = "rotate(45deg) translate(5px, 5px)";
      spans[1].style.opacity = "0";
      spans[2].style.transform = "rotate(-45deg) translate(5px, -5px)";
    } else {
      spans[0].style.transform = "none";
      spans[1].style.opacity = "1";
      spans[2].style.transform = "none";
    }
  });

  // Close menu when clicking a link
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("active");
      menuBtn.classList.remove("active");
      const spans = menuBtn.querySelectorAll("span");
      spans[0].style.transform = "none";
      spans[1].style.opacity = "1";
      spans[2].style.transform = "none";
    });
  });
}

// ===== Smooth Scroll =====
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));

      if (target) {
        const navHeight = document.querySelector(".navbar").offsetHeight;
        const targetPosition =
          target.getBoundingClientRect().top + window.pageYOffset - navHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: "smooth",
        });
      }
    });
  });
}

// ===== Parallax Effect for Hero Background =====
window.addEventListener("scroll", () => {
  const scrolled = window.pageYOffset;
  const hero = document.querySelector(".hero");

  if (hero && scrolled < window.innerHeight) {
    const orbs = hero.querySelectorAll(".gradient-orb");
    orbs.forEach((orb, index) => {
      const speed = 0.1 + index * 0.05;
      orb.style.transform = `translateY(${scrolled * speed}px)`;
    });
  }
});

// ===== Interactive Phone Demo =====
function initInteractivePhone() {
  const interactiveScreens = document.querySelectorAll(".interactive-screen");
  const tapAreas = document.querySelectorAll(".tap-area");
  const fixedHeader = document.querySelector(".ios-fixed-header");
  const headerImg = fixedHeader?.querySelector(".header-img");
  const scrollAreas = document.querySelectorAll(".screen-scroll-area");

  if (interactiveScreens.length === 0) return;

  // Detect scroll to toggle header transparency
  scrollAreas.forEach((scrollArea) => {
    scrollArea.addEventListener("scroll", () => {
      if (fixedHeader) {
        if (scrollArea.scrollTop > 10) {
          fixedHeader.classList.add("scrolled");
        } else {
          fixedHeader.classList.remove("scrolled");
        }
      }
    });
  });

  // Handle tap area clicks
  tapAreas.forEach((tapArea) => {
    tapArea.addEventListener("click", (e) => {
      e.preventDefault();
      const targetScreen = tapArea.getAttribute("data-goto");

      if (targetScreen) {
        // Hide all screens
        interactiveScreens.forEach((screen) => {
          screen.classList.remove("active");
        });

        // Show target screen
        const newScreen = document.querySelector(
          `.interactive-screen[data-screen="${targetScreen}"]`,
        );
        if (newScreen) {
          newScreen.classList.add("active");
          // Reset scroll position
          const scrollArea = newScreen.querySelector(".screen-scroll-area");
          if (scrollArea) {
            scrollArea.scrollTop = 0;
          }

          // Update fixed header image to match current screen
          if (headerImg) {
            const screenImg = newScreen.querySelector("img");
            if (screenImg) {
              headerImg.src = screenImg.src;
            }
          }

          // Reset header transparency state
          if (fixedHeader) {
            fixedHeader.classList.remove("scrolled");
          }
        }
      }
    });
  });

  // Add touch feedback
  tapAreas.forEach((tapArea) => {
    tapArea.addEventListener("touchstart", () => {
      tapArea.style.transform = "scale(0.95)";
    });

    tapArea.addEventListener("touchend", () => {
      tapArea.style.transform = "";
    });
  });
}
