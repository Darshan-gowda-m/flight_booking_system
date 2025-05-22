// document.addEventListener('DOMContentLoaded', () => {
//   const loginForm = document.getElementById('loginForm')
//   const registerForm = document.getElementById('registerForm')
//   const errorMsg = document.getElementById('errorMsg')
//   const successMsg = document.getElementById('successMsg')

//   console.debug('[Auth Debug] Checking initial authentication state')
//   const token = localStorage.getItem('token')
//   const userData = localStorage.getItem('user')
//   let currentUser = null

//   try {
//     currentUser = userData ? JSON.parse(userData) : null
//   } catch (e) {
//     console.error('[Auth Error] Failed to parse user data:', e)
//     localStorage.removeItem('user')
//   }

//   console.debug('[Auth Debug] Current user:', currentUser)

//   // Redirect if already logged in
//   if (token && currentUser) {
//     console.debug('[Auth Debug] User is authenticated, redirecting...')
//     console.debug(`[Auth Debug] User role: ${currentUser.role}`)
//     window.location.href =
//       currentUser.role === 'admin'
//         ? '/adminDashboard.html'
//         : '/userDashboard.html'
//     return
//   }

//   // Eye toggling functionality
//   const togglePasswordVisibility = (inputId, toggleId) => {
//     const passwordInput = document.getElementById(inputId)
//     const toggleIcon = document.getElementById(toggleId)
//     if (passwordInput.type === 'password') {
//       passwordInput.type = 'text'
//       toggleIcon.classList.replace('fa-eye', 'fa-eye-slash')
//       toggleIcon.setAttribute('aria-label', 'Hide password')
//     } else {
//       passwordInput.type = 'password'
//       toggleIcon.classList.replace('fa-eye-slash', 'fa-eye')
//       toggleIcon.setAttribute('aria-label', 'Show password')
//     }
//   }

//   // Add eye toggles to password fields
//   const addEyeToggles = () => {
//     const passwordFields = document.querySelectorAll('input[type="password"]')
//     passwordFields.forEach((field) => {
//       const wrapper = document.createElement('div')
//       wrapper.classList.add('password-wrapper')
//       field.parentNode.insertBefore(wrapper, field)
//       wrapper.appendChild(field)

//       const toggleIcon = document.createElement('i')
//       toggleIcon.classList.add('fas', 'fa-eye', 'password-toggle')
//       toggleIcon.id = `${field.id}-toggle`
//       toggleIcon.setAttribute('aria-label', 'Show password')
//       toggleIcon.setAttribute('tabindex', '0')
//       toggleIcon.addEventListener('click', () => {
//         togglePasswordVisibility(field.id, toggleIcon.id)
//       })
//       toggleIcon.addEventListener('keydown', (e) => {
//         if (e.key === 'Enter' || e.key === ' ') {
//           togglePasswordVisibility(field.id, toggleIcon.id)
//         }
//       })
//       wrapper.appendChild(toggleIcon)
//     })
//   }

//   // Handle login form submission
//   if (loginForm) {
//     addEyeToggles()
//     loginForm.addEventListener('submit', async (e) => {
//       e.preventDefault()
//       const email = document.getElementById('email').value
//       const password = document.getElementById('password').value

//       console.debug('[Login Debug] Form submission started')
//       console.debug('[Login Debug] Email:', email)

//       if (!validateEmail(email)) {
//         showError('Please enter a valid email address.')
//         return
//       }

//       if (!validatePassword(password)) {
//         showError(
//           'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.'
//         )
//         return
//       }

//       setLoading(true, loginForm)
//       try {
//         console.debug('[Login Debug] Sending request to server...')
//         const response = await fetch(
//           'https://flight-booking-system-ycrm.onrender.com/api/auth/login',
//           {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ email, password }),
//           }
//         )

//         const data = await response.json()
//         console.debug('[Login Debug] Server response:', data)

//         if (response.status === 403) {
//           console.debug('[Login Debug] Inactive user attempt')
//           showError(
//             data.message || 'Account is blocked. Please contact the admin.'
//           )
//           return
//         }

//         if (!response.ok) {
//           console.debug('[Login Debug] Login failed:', data.message)
//           showError(data.message || 'Invalid credentials. Please try again.')
//           return
//         }

//         console.debug('[Login Debug] Login successful, storing credentials')
//         localStorage.setItem('token', data.token)

//         const user = {
//           id: data.user.id,
//           username: data.user.username,
//           email: data.user.email,
//           role: data.user.role,
//           is_active: data.user.is_active,
//         }
//         localStorage.setItem('user', JSON.stringify(user))

//         console.debug('[Login Debug] Stored values verification:')
//         console.debug('Token:', localStorage.getItem('token'))
//         console.debug('User:', JSON.parse(localStorage.getItem('user')))

//         showSuccess('Login successful! Redirecting...')
//         setTimeout(() => {
//           console.debug(
//             '[Login Debug] Redirecting to:',
//             user.role === 'admin' ? 'Admin Dashboard' : 'User Dashboard'
//           )
//           window.location.href =
//             user.role === 'admin'
//               ? '/adminDashboard.html'
//               : '/userDashboard.html'
//         }, 2000)
//       } catch (error) {
//         console.error('[Login Debug] Error:', error)
//         showError('An error occurred. Please try again.')
//       } finally {
//         setLoading(false, loginForm)
//       }
//     })
//   }

//   if (registerForm) {
//     addEyeToggles()
//     registerForm.addEventListener('submit', async (e) => {
//       e.preventDefault()
//       const username = document.getElementById('username').value
//       const email = document.getElementById('email').value
//       const password = document.getElementById('password').value
//       const confirmPassword = document.getElementById('confirmPassword').value

//       console.debug('[Register Debug] Form submission started')
//       console.debug('[Register Debug] Username:', username)
//       console.debug('[Register Debug] Email:', email)

//       if (password !== confirmPassword) {
//         console.debug('[Register Debug] Password mismatch')
//         showError('Passwords do not match')
//         return
//       }

//       if (!validateEmail(email)) {
//         showError('Please enter a valid email address.')
//         return
//       }

//       if (!validatePassword(password)) {
//         showError(
//           'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.'
//         )
//         return
//       }

//       setLoading(true, registerForm)
//       try {
//         console.debug('[Register Debug] Sending request to server...')
//         const response = await fetch(
//           'https://flight-booking-system-ycrm.onrender.com/api/auth/register',
//           {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ username, email, password }),
//           }
//         )

//         const data = await response.json()
//         console.debug('[Register Debug] Server response:', data)

//         if (!response.ok) {
//           console.debug('[Register Debug] Registration failed:', data.message)
//           showError(data.message || 'Registration failed')
//           return
//         }

//         showSuccess('Registration successful! Redirecting to login...')
//         setTimeout(() => {
//           console.debug('[Register Debug] Redirecting to login')
//           window.location.href = '/login.html'
//         }, 2000)
//       } catch (error) {
//         console.error('[Register Debug] Error:', error)
//         showError('An error occurred. Please try again.')
//       } finally {
//         setLoading(false, registerForm)
//       }
//     })
//   }

//   // Utility functions
//   function validateEmail(email) {
//     const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
//     return regex.test(email)
//   }

//   function validatePassword(password) {
//     const regex =
//       /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
//     return regex.test(password)
//   }

//   function setLoading(isLoading, form) {
//     const submitButton = form.querySelector('button[type="submit"]')
//     if (isLoading) {
//       console.debug('[UI Debug] Showing loading state')
//       submitButton.disabled = true
//       submitButton.innerHTML =
//         '<i class="fas fa-spinner fa-spin"></i> Loading...'
//     } else {
//       console.debug('[UI Debug] Hiding loading state')
//       submitButton.disabled = false
//       submitButton.innerHTML = 'Submit'
//     }
//   }

//   function showError(message) {
//     console.debug('[UI Debug] Showing error message:', message)
//     errorMsg.textContent = message
//     errorMsg.style.display = 'block'
//     successMsg.style.display = 'none'
//   }

//   function showSuccess(message) {
//     console.debug('[UI Debug] Showing success message:', message)
//     successMsg.textContent = message
//     successMsg.style.display = 'block'
//     errorMsg.style.display = 'none'
//   }
// })
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm')
  const registerForm = document.getElementById('registerForm')
  const errorMsg = document.getElementById('errorMsg')
  const successMsg = document.getElementById('successMsg')

  // AUTH CHECK
  const token = localStorage.getItem('token')
  let currentUser = null

  try {
    currentUser = localStorage.getItem('user')
      ? JSON.parse(localStorage.getItem('user'))
      : null
  } catch (e) {
    console.error('[Auth Error] Failed to parse user data:', e)
    localStorage.removeItem('user')
  }

  if (token && currentUser) {
    const redirectPath =
      currentUser.role === 'admin'
        ? '/adminDashboard.html'
        : '/userDashboard.html'
    window.location.href = redirectPath
    return
  }

  // UTILS
  function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return regex.test(email)
  }

  function validatePassword(password) {
    const regex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    return regex.test(password)
  }

  function setLoading(isLoading, form) {
    const btn = form.querySelector('button[type="submit"]')
    btn.disabled = isLoading
    btn.innerHTML = isLoading
      ? '<i class="fas fa-spinner fa-spin"></i> Loading...'
      : 'Submit'
  }

  function showError(message) {
    errorMsg.textContent = message
    errorMsg.style.display = 'block'
    successMsg.style.display = 'none'
  }

  function showSuccess(message) {
    successMsg.textContent = message
    successMsg.style.display = 'block'
    errorMsg.style.display = 'none'
  }

  // PASSWORD VISIBILITY TOGGLE
  function setupPasswordToggles() {
    const passwordFields = document.querySelectorAll('input[type="password"]')

    passwordFields.forEach((field) => {
      const wrapper = document.createElement('div')
      wrapper.className = 'password-wrapper'
      field.parentNode.insertBefore(wrapper, field)
      wrapper.appendChild(field)

      const toggleIcon = document.createElement('i')
      toggleIcon.className = 'fas fa-eye password-toggle'
      toggleIcon.id = `${field.id}-toggle`
      toggleIcon.setAttribute('aria-label', 'Show password')
      toggleIcon.setAttribute('tabindex', '0')

      toggleIcon.addEventListener('click', () =>
        togglePassword(field, toggleIcon)
      )
      toggleIcon.addEventListener('keydown', (e) => {
        if (['Enter', ' '].includes(e.key)) togglePassword(field, toggleIcon)
      })

      wrapper.appendChild(toggleIcon)
    })
  }

  function togglePassword(input, icon) {
    const isPassword = input.type === 'password'
    input.type = isPassword ? 'text' : 'password'
    icon.classList.toggle('fa-eye')
    icon.classList.toggle('fa-eye-slash')
    icon.setAttribute(
      'aria-label',
      isPassword ? 'Hide password' : 'Show password'
    )
  }

  // LOGIN
  if (loginForm) {
    setupPasswordToggles()

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const email = document.getElementById('email').value.trim()
      const password = document.getElementById('password').value

      if (!validateEmail(email))
        return showError('Please enter a valid email address.')
      if (!validatePassword(password)) {
        return showError(
          'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
        )
      }

      setLoading(true, loginForm)

      try {
        const response = await fetch(
          'https://flight-booking-system-ycrm.onrender.com/api/auth/login',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          }
        )

        const data = await response.json()

        if (response.status === 403)
          return showError(
            data.message || 'Account is blocked. Please contact the admin.'
          )
        if (!response.ok)
          return showError(data.message || 'Invalid credentials.')

        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))

        showSuccess('Login successful! Redirecting...')
        setTimeout(() => {
          window.location.href =
            data.user.role === 'admin'
              ? '/adminDashboard.html'
              : '/userDashboard.html'
        }, 2000)
      } catch (err) {
        console.error('[Login Error]', err)
        showError('Something went wrong. Please try again.')
      } finally {
        setLoading(false, loginForm)
      }
    })
  }

  // REGISTER
  if (registerForm) {
    setupPasswordToggles()

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault()

      const username = document.getElementById('username').value.trim()
      const email = document.getElementById('email').value.trim()
      const password = document.getElementById('password').value
      const confirmPassword = document.getElementById('confirmPassword').value

      if (password !== confirmPassword)
        return showError('Passwords do not match.')
      if (!validateEmail(email)) return showError('Please enter a valid email.')
      if (!validatePassword(password)) {
        return showError('Password must meet security requirements.')
      }

      setLoading(true, registerForm)

      try {
        const response = await fetch(
          'https://flight-booking-system-ycrm.onrender.com/api/auth/register',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password }),
          }
        )

        const data = await response.json()

        if (!response.ok)
          return showError(data.message || 'Registration failed.')

        showSuccess('Registration successful! Redirecting to login...')
        setTimeout(() => (window.location.href = '/login.html'), 2000)
      } catch (err) {
        console.error('[Register Error]', err)
        showError('Something went wrong. Please try again.')
      } finally {
        setLoading(false, registerForm)
      }
    })
  }
})
