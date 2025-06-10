// import { Chart } from "@/components/ui/chart"
// // Dashboard JavaScript functionality
// document.addEventListener("DOMContentLoaded", () => {
//   // Sidebar functionality
//   const sidebar = document.getElementById("sidebar")
//   const mainContent = document.getElementById("main-content")
//   const sidebarToggle = document.getElementById("sidebar-toggle")
//   const mobileMenuToggle = document.getElementById("mobile-menu-toggle")
//   const sidebarLinks = document.querySelectorAll(".sidebar-link")

//   // Initialize sidebar state
//   initializeSidebar()

//   // Toggle sidebar
//   if (sidebarToggle) {
//     sidebarToggle.addEventListener("click", () => {
//       toggleSidebar()
//     })
//   }

//   // Mobile menu toggle
//   if (mobileMenuToggle) {
//     mobileMenuToggle.addEventListener("click", () => {
//       sidebar.classList.toggle("show")
//     })
//   }

//   // Sidebar link highlighting
//   highlightActiveLink()

//   // Close sidebar when clicking outside on mobile
//   document.addEventListener("click", (e) => {
//     if (window.innerWidth <= 768) {
//       if (!sidebar.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
//         sidebar.classList.remove("show")
//       }
//     }
//   })

//   // Handle window resize
//   window.addEventListener("resize", () => {
//     if (window.innerWidth > 768) {
//       sidebar.classList.remove("show")
//     }
//   })

//   // Functions
//   function initializeSidebar() {
//     // Check if sidebar should be collapsed from localStorage
//     const isCollapsed = localStorage.getItem("sidebarCollapsed") === "true"
//     if (isCollapsed) {
//       sidebar.classList.add("collapsed")
//       mainContent.classList.add("expanded")
//       updateToggleIcon(true)
//     }
//   }

//   function toggleSidebar() {
//     const isCollapsed = sidebar.classList.toggle("collapsed")
//     mainContent.classList.toggle("expanded")
//     updateToggleIcon(isCollapsed)

//     // Save state to localStorage
//     localStorage.setItem("sidebarCollapsed", isCollapsed)
//   }

//   function updateToggleIcon(isCollapsed) {
//     const icon = sidebarToggle.querySelector("i")
//     if (isCollapsed) {
//       icon.classList.remove("fa-chevron-left")
//       icon.classList.add("fa-chevron-right")
//     } else {
//       icon.classList.remove("fa-chevron-right")
//       icon.classList.add("fa-chevron-left")
//     }
//   }

//   function highlightActiveLink() {
//     const currentPath = window.location.pathname

//     // Remove active class from all links
//     sidebarLinks.forEach((link) => {
//       link.classList.remove("active")
//     })

//     // Add active class to current page link
//     sidebarLinks.forEach((link) => {
//       const linkPath = new URL(link.href).pathname
//       if (linkPath === currentPath) {
//         link.classList.add("active")
//       }
//     })

//     // Handle click events for sidebar links
//     sidebarLinks.forEach((link) => {
//       link.addEventListener("click", function (e) {
//         // Remove active class from all links
//         sidebarLinks.forEach((l) => l.classList.remove("active"))
//         // Add active class to clicked link
//         this.classList.add("active")
//       })
//     })
//   }

//   // Smooth scrolling for better UX
//   document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
//     anchor.addEventListener("click", function (e) {
//       e.preventDefault()
//       const target = document.querySelector(this.getAttribute("href"))
//       if (target) {
//         target.scrollIntoView({
//           behavior: "smooth",
//           block: "start",
//         })
//       }
//     })
//   })

//   // Form validation helper
//   function validateForm(formElement) {
//     const inputs = formElement.querySelectorAll("input[required], select[required], textarea[required]")
//     let isValid = true

//     inputs.forEach((input) => {
//       if (!input.value.trim()) {
//         input.classList.add("is-invalid")
//         isValid = false
//       } else {
//         input.classList.remove("is-invalid")
//       }
//     })

//     return isValid
//   }

//   // Loading state helper
//   function setLoadingState(element, isLoading) {
//     if (isLoading) {
//       element.classList.add("loading")
//       element.disabled = true
//     } else {
//       element.classList.remove("loading")
//       element.disabled = false
//     }
//   }

//   // Toast notification helper
//   function showToast(message, type = "success") {
//     // Create toast element
//     const toast = document.createElement("div")
//     toast.className = `toast align-items-center text-white bg-${type} border-0`
//     toast.setAttribute("role", "alert")
//     toast.innerHTML = `
//             <div class="d-flex">
//                 <div class="toast-body">${message}</div>
//                 <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
//             </div>
//         `

//     // Add to toast container or create one
//     let toastContainer = document.querySelector(".toast-container")
//     if (!toastContainer) {
//       toastContainer = document.createElement("div")
//       toastContainer.className = "toast-container position-fixed top-0 end-0 p-3"
//       document.body.appendChild(toastContainer)
//     }

//     toastContainer.appendChild(toast)

//     // Initialize and show toast
//     const toastEl = document.querySelector(".toast")
//     const bsToast = bootstrap.Toast.getOrCreateInstance(toastEl)
//     bsToast.show()

//     // Remove toast element after it's hidden
//     toast.addEventListener("hidden.bs.toast", () => {
//       toast.remove()
//     })
//   }

//   // Export functions for global use
//   window.adminDashboard = {
//     validateForm,
//     setLoadingState,
//     showToast,
//     toggleSidebar,
//   }
// })

// // Chart.js helper functions
// function createChart(canvasId, config) {
//   const ctx = document.getElementById(canvasId)
//   if (!ctx) return null

//   return new Chart(ctx.getContext("2d"), config)
// }

// // Stats animation helper
// function animateValue(element, start, end, duration, formatter = null) {
//   let startTimestamp = null
//   const step = (timestamp) => {
//     if (!startTimestamp) startTimestamp = timestamp
//     const progress = Math.min((timestamp - startTimestamp) / duration, 1)
//     const value = Math.floor(progress * (end - start) + start)

//     if (formatter) {
//       element.innerHTML = formatter(value)
//     } else {
//       element.innerHTML = value.toLocaleString()
//     }

//     if (progress < 1) {
//       window.requestAnimationFrame(step)
//     }
//   }
//   window.requestAnimationFrame(step)
// }

// // Data table helper
// function initializeDataTable(tableId, options = {}) {
//   const defaultOptions = {
//     responsive: true,
//     pageLength: 10,
//     order: [[0, "desc"]],
//     language: {
//       search: "Search:",
//       lengthMenu: "Show _MENU_ entries",
//       info: "Showing _START_ to _END_ of _TOTAL_ entries",
//       paginate: {
//         first: "First",
//         last: "Last",
//         next: "Next",
//         previous: "Previous",
//       },
//     },
//   }

//   const finalOptions = { ...defaultOptions, ...options }

//   if (typeof DataTable !== "undefined") {
//     const table = new DataTable(`#${tableId}`, finalOptions)
//     return table
//   }

//   return null
// }
