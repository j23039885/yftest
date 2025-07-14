// Mobile Navigation Toggle
document.addEventListener("DOMContentLoaded", function () {
  const menuToggle = document.getElementById("menu-toggle");
  const navLinks = document.querySelector(".nav-links");

  if (menuToggle) {
    menuToggle.addEventListener("click", function () {
      navLinks.classList.toggle("active");
    });
  }

  // Close menu when clicking on a link
  const navItems = document.querySelectorAll(".nav-links a");
  navItems.forEach((item) => {
    item.addEventListener("click", function () {
      navLinks.classList.remove("active");
    });
  });

  // Menu Tab Navigation
  const menuTabs = document.querySelectorAll(".menu-tab");
  const menuContents = document.querySelectorAll(".menu-tab-content");

  if (menuTabs.length > 0) {
    menuTabs.forEach((tab) => {
      tab.addEventListener("click", function () {
        // Remove active class from all tabs and contents
        menuTabs.forEach((t) => t.classList.remove("active"));
        menuContents.forEach((c) => c.classList.remove("active"));

        // Add active class to clicked tab
        this.classList.add("active");

        // Show corresponding content
        const tabId = this.getAttribute("data-tab");
        document.getElementById(tabId).classList.add("active");
      });
    });
  }

  // Form validation
  const contactForm = document.querySelector(".contact-form form");
  const reservationForm = document.querySelector(".reservation-form form");

  function validateForm(e, form) {
    let isValid = true;
    const requiredFields = form.querySelectorAll("[required]");

    // Clear previous error messages
    const errorMessages = form.querySelectorAll(".error-message");
    errorMessages.forEach((msg) => msg.remove());

    // Check each required field
    requiredFields.forEach((field) => {
      if (!field.value.trim()) {
        isValid = false;
        const errorMessage = document.createElement("div");
        errorMessage.className = "error-message";
        errorMessage.style.color = "red";
        errorMessage.style.fontSize = "0.9rem";
        errorMessage.style.marginTop = "5px";
        errorMessage.textContent = "This field is required";
        field.parentNode.appendChild(errorMessage);
        field.style.borderColor = "red";
      } else {
        field.style.borderColor = "";
      }
    });

    // Validate email format if it exists
    const emailField = form.querySelector('input[type="email"]');
    if (emailField && emailField.value.trim()) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(emailField.value)) {
        isValid = false;
        const errorMessage = document.createElement("div");
        errorMessage.className = "error-message";
        errorMessage.style.color = "red";
        errorMessage.style.fontSize = "0.9rem";
        errorMessage.style.marginTop = "5px";
        errorMessage.textContent = "Please enter a valid email address";
        emailField.parentNode.appendChild(errorMessage);
        emailField.style.borderColor = "red";
      }
    }

    // Validate phone number if it exists
    const phoneField = form.querySelector('input[type="tel"]');
    if (phoneField && phoneField.value.trim()) {
      const phonePattern = /^[+]?[\d\s-]{8,15}$/;
      if (!phonePattern.test(phoneField.value)) {
        isValid = false;
        const errorMessage = document.createElement("div");
        errorMessage.className = "error-message";
        errorMessage.style.color = "red";
        errorMessage.style.fontSize = "0.9rem";
        errorMessage.style.marginTop = "5px";
        errorMessage.textContent = "Please enter a valid phone number";
        phoneField.parentNode.appendChild(errorMessage);
        phoneField.style.borderColor = "red";
      }
    }

    // Check for reservation date to be in the future
    const dateField = form.querySelector('input[type="date"]');
    if (dateField && dateField.value) {
      const selectedDate = new Date(dateField.value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate < today) {
        isValid = false;
        const errorMessage = document.createElement("div");
        errorMessage.className = "error-message";
        errorMessage.style.color = "red";
        errorMessage.style.fontSize = "0.9rem";
        errorMessage.style.marginTop = "5px";
        errorMessage.textContent = "Please select a future date";
        dateField.parentNode.appendChild(errorMessage);
        dateField.style.borderColor = "red";
      }
    }

    if (!isValid) {
      e.preventDefault();
      // Scroll to the first error
      const firstError = form.querySelector(".error-message");
      if (firstError) {
        firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      validateForm(e, this);
    });
  }

  if (reservationForm) {
    reservationForm.addEventListener("submit", function (e) {
      validateForm(e, this);
    });
  }

  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const targetId = this.getAttribute("href");
      if (targetId !== "#") {
        e.preventDefault();
        const target = document.querySelector(targetId);
        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }
    });
  });

  // Set minimum date for reservation form
  const reservationDateInput = document.getElementById("res-date");
  if (reservationDateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formattedDate = tomorrow.toISOString().split("T")[0];
    reservationDateInput.setAttribute("min", formattedDate);
  }

  // Current year for copyright in footer
  const yearSpan = document.querySelector(".footer-bottom p");
  if (yearSpan) {
    const currentYear = new Date().getFullYear();
    yearSpan.innerHTML = yearSpan.innerHTML.replace("2025", currentYear);
  }

  // Add animation on scroll for sections
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    },
    { threshold: 0.1 }
  );

  // document.querySelectorAll('section').forEach(section => {
  //     section.style.opacity = '0';
  //     section.style.transform = 'translateY(20px)';
  //     section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  //     observer.observe(section);
  // });

  // Add the visible class to already visible sections
  document.querySelectorAll("section.visible").forEach((section) => {
    section.style.opacity = "1";
    section.style.transform = "translateY(0)";
  });
});
