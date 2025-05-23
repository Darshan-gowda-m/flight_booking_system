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
          'https://flight-booking-system-c0g3.onrender.com/api/auth/login',

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
          'https://flight-booking-system-c0g3.onrender.com/api/auth/register',
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
