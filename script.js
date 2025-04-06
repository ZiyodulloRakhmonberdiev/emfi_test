// Global variables
let deals = []
let contacts = []
let tasks = []
let expandedDealId = null
let dealDetailsModal = null
let accessTokenData = null

// DOM elements
document.addEventListener("DOMContentLoaded", () => {
  // Initialize Bootstrap modal
  const bootstrap = window.bootstrap // Access bootstrap from window
  dealDetailsModal = new bootstrap.Modal(document.getElementById("dealDetailsModal"))

  // Add event listeners
  document.getElementById("getTokenBtn").addEventListener("click", getAccessToken)
  document.getElementById("fetchDealsBtn").addEventListener("click", startFetchingData)
  document.getElementById("useExistingToken").addEventListener("change", toggleTokenSection)
  document.getElementById("toggleSidebar").addEventListener("click", toggleSidebar)
  document.getElementById("closeSidebar").addEventListener("click", closeSidebar)

  // Initialize empty sidebar
  updateSidebarTasks([])
  updateSidebarContacts([])

  // Check if we have a stored token
  const storedToken = localStorage.getItem("amocrm_token")
  if (storedToken) {
    try {
      accessTokenData = JSON.parse(storedToken)
      document.getElementById("useExistingToken").checked = true
      toggleTokenSection()
      document.getElementById("accessToken").value = accessTokenData.access_token
    } catch (e) {
      console.error("Error parsing stored token:", e)
      localStorage.removeItem("amocrm_token")
    }
  }
})

// Toggle sidebar on mobile
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar")
  const mainContent = document.getElementById("mainContent")

  sidebar.classList.toggle("show")

  // On desktop, adjust main content margin when sidebar is toggled
  if (window.innerWidth > 768) {
    if (sidebar.classList.contains("show")) {
      mainContent.style.marginLeft = "0"
    } else {
      mainContent.style.marginLeft = "var(--sidebar-width)"
    }
  }
}

// Close sidebar on mobile
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("show")
}

// Toggle token input section
function toggleTokenSection() {
  const useExisting = document.getElementById("useExistingToken").checked
  const tokenSection = document.getElementById("tokenSection")

  if (useExisting) {
    tokenSection.classList.remove("d-none")
  } else {
    tokenSection.classList.add("d-none")
  }
}

// Get access token using authorization code
async function getAccessToken() {
  const clientId = document.getElementById("clientId").value.trim()
  const clientSecret = document.getElementById("clientSecret").value.trim()
  const authCode = document.getElementById("authCode").value.trim()
  const redirectUri = document.getElementById("redirectUri").value.trim()
  const subdomain = document.getElementById("subdomain").value.trim()

  if (!clientId || !clientSecret || !authCode || !redirectUri || !subdomain) {
    showError("Пожалуйста, заполните все поля для получения токена")
    return
  }

  showLoading()
  hideError()

  try {
    // Prepare token request data
    const tokenRequestData = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: authCode,
      redirect_uri: redirectUri,
    }

    console.log("Token request data:", tokenRequestData)

    // Make token request through proxy
    const tokenUrl = `https://${subdomain}.amocrm.ru/oauth2/access_token`
    const proxyUrl = `http://localhost:8080?url=${encodeURIComponent(tokenUrl)}`

    console.log("Sending token request to:", proxyUrl)

    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tokenRequestData),
    })

    const responseText = await response.text()
    console.log("Token response status:", response.status)
    console.log("Token response text:", responseText)

    if (!response.ok) {
      throw new Error(`Ошибка получения токена: ${response.status} ${responseText}`)
    }

    // Parse token response
    let tokenData
    try {
      tokenData = JSON.parse(responseText)
    } catch (e) {
      throw new Error(`Не удалось разобрать ответ сервера: ${e.message}`)
    }

    if (!tokenData.access_token) {
      throw new Error("Токен доступа отсутствует в ответе сервера")
    }

    console.log("Received token data:", tokenData)

    // Store token data
    accessTokenData = tokenData
    localStorage.setItem("amocrm_token", JSON.stringify(tokenData))

    // Update UI
    document.getElementById("useExistingToken").checked = true
    toggleTokenSection()
    document.getElementById("accessToken").value = tokenData.access_token

    hideLoading()
    showSuccess("Токен успешно получен! Теперь вы можете загрузить сделки.")
  } catch (error) {
    console.error("Error getting access token:", error)
    hideLoading()
    showError(`Ошибка получения токена: ${error.message}`)
  }
}

// Show success message
function showSuccess(message) {
  const errorElement = document.getElementById("errorMessage")
  errorElement.classList.remove("alert-danger")
  errorElement.classList.add("alert-success")
  document.getElementById("errorText").textContent = message
  errorElement.classList.remove("d-none")

  // Auto hide after 5 seconds
  setTimeout(() => {
    errorElement.classList.add("d-none")
  }, 5000)
}

// Start the data fetching process
async function startFetchingData() {
  const accessToken = document.getElementById("accessToken").value.trim()
  const subdomain = document.getElementById("subdomain").value.trim()

  if (!accessToken) {
    showError("Пожалуйста, введите Access Token")
    return
  }

  if (!subdomain) {
    showError("Пожалуйста, введите поддомен amoCRM")
    return
  }

  // Reset previous data
  deals = []
  contacts = []
  tasks = []
  expandedDealId = null
  document.getElementById("dealsTableBody").innerHTML = ""

  // Show loading indicator
  showLoading()
  hideError()
  hideDealsTable()
  hideNoDealsMessage()

  try {
    console.log("Starting data fetch with token:", accessToken.substring(0, 10) + "...")

    // Test API connection first
    try {
      const testResponse = await makeApiRequest(subdomain, "/api/v4/account", accessToken)
      console.log("API connection test successful:", testResponse)
    } catch (testError) {
      console.error("API connection test failed:", testError)
      throw new Error(`Не удалось подключиться к API: ${testError.message}`)
    }

    // Fetch all deals
    await fetchDeals(accessToken, subdomain)

    // If no deals found
    if (deals.length === 0) {
      hideLoading()
      showNoDealsMessage()
      return
    }

    // Fetch all contacts
    await fetchContacts(accessToken, subdomain)

    // Fetch all tasks
    await fetchTasks(accessToken, subdomain)

    // Update sidebar with tasks and contacts
    updateSidebarTasks(tasks)
    updateSidebarContacts(contacts)

    // Render the deals table
    renderDealsTable()

    // Hide loading indicator and show table
    hideLoading()
    showDealsTable()
    document.getElementById("totalDeals").textContent = `${deals.length} сделок`
  } catch (error) {
    console.error("Error fetching data:", error)
    hideLoading()
    showError(`Ошибка загрузки данных: ${error.message}`)
  }
}

// Update sidebar with tasks
function updateSidebarTasks(tasksList) {
  const tasksContainer = document.getElementById("sidebarTasks")
  const taskCount = document.getElementById("sidebarTaskCount")

  if (!tasksContainer) return

  // Set task count
  taskCount.textContent = tasksList.length.toString()

  // If no tasks, show empty message
  if (tasksList.length === 0) {
    tasksContainer.innerHTML = '<div class="sidebar-empty">Нет активных задач</div>'
    return
  }

  // Sort tasks by due date (closest first)
  const sortedTasks = [...tasksList].sort((a, b) => a.complete_till - b.complete_till)

  // Take only the first 5 tasks
  const recentTasks = sortedTasks.slice(0, 5)

  // Generate HTML for tasks
  let tasksHtml = ""
  recentTasks.forEach((task) => {
    const taskStatus = getTaskStatusSVG(task)
    const dueDate = formatTaskDueDate(task.complete_till)

    tasksHtml += `
      <div class="sidebar-item">
        <div>${taskStatus}</div>
        <div class="sidebar-item-content">
          <div class="sidebar-item-title">${task.text || "Без описания"}</div>
          <div class="sidebar-item-subtitle">Срок: ${dueDate}</div>
        </div>
      </div>
    `
  })

  tasksContainer.innerHTML = tasksHtml
}

// Update sidebar with contacts
function updateSidebarContacts(contactsList) {
  const contactsContainer = document.getElementById("sidebarContacts")
  const contactCount = document.getElementById("sidebarContactCount")

  if (!contactsContainer) return

  // Set contact count
  contactCount.textContent = contactsList.length.toString()

  // If no contacts, show empty message
  if (contactsList.length === 0) {
    contactsContainer.innerHTML = '<div class="sidebar-empty">Нет контактов</div>'
    return
  }

  // Sort contacts by creation date (newest first)
  const sortedContacts = [...contactsList].sort((a, b) => b.created_at - a.created_at)

  // Take only the first 5 contacts
  const recentContacts = sortedContacts.slice(0, 5)

  // Generate HTML for contacts
  let contactsHtml = ""
  recentContacts.forEach((contact) => {
    // Get phone number
    let phone = "Нет телефона"
    if (contact.custom_fields_values) {
      const phoneField = contact.custom_fields_values.find(
        (field) => field.field_code === "PHONE" || field.field_name === "Телефон",
      )

      if (phoneField && phoneField.values && phoneField.values.length > 0) {
        phone = phoneField.values[0].value
      }
    }

    contactsHtml += `
      <div class="sidebar-item">
        <div class="user-avatar" style="width: 26px; height: 26px; font-size: 12px;">
          <i class="fas fa-user"></i>
        </div>
        <div class="sidebar-item-content">
          <div class="sidebar-item-title">${contact.name || "Без имени"}</div>
          <div class="sidebar-item-phone">
            <i class="fas fa-phone"></i> ${phone}
          </div>
        </div>
      </div>
    `
  })

  contactsContainer.innerHTML = contactsHtml
}

// Fetch deals from amoCRM API with rate limiting
async function fetchDeals(accessToken, subdomain) {
  try {
    document.getElementById("progressText").textContent = "Загрузка сделок..."

    // First request to get total count
    const initialResponse = await makeApiRequest(subdomain, "/api/v4/leads", accessToken, { limit: 2 })

    console.log("Initial deals response:", initialResponse)

    const totalDeals = initialResponse._total_items || 0
    const fetchedDeals = initialResponse._embedded?.leads || []

    // Add to our deals array
    deals = deals.concat(fetchedDeals)

    // Update progress
    document.getElementById("progressText").textContent = `Обработка сделок: ${deals.length}/${totalDeals}`

    // If there are more deals to fetch
    if (deals.length < totalDeals) {
      let page = 2

      while (deals.length < totalDeals) {
        // Rate limiting - wait 1 second between requests
        await new Promise((resolve) => setTimeout(resolve, 1000))

        const response = await makeApiRequest(subdomain, "/api/v4/leads", accessToken, {
          limit: 2,
          page,
        })

        const pageDeals = response._embedded?.leads || []
        deals = deals.concat(pageDeals)

        // Update progress
        document.getElementById("progressText").textContent = `Обработка сделок: ${deals.length}/${totalDeals}`

        page++

        // Safety check to prevent infinite loops
        if (pageDeals.length === 0 || page > 100) break
      }
    }

    console.log(`Загружено ${deals.length} сделок`)
  } catch (error) {
    console.error("Error fetching deals:", error)
    throw new Error(`Не удалось загрузить сделки: ${error.message}`)
  }
}

// Fetch contacts from amoCRM API with rate limiting
async function fetchContacts(accessToken, subdomain) {
  try {
    document.getElementById("progressText").textContent = "Загрузка контактов..."

    // First request to get total count
    const initialResponse = await makeApiRequest(subdomain, "/api/v4/contacts", accessToken, { limit: 2 })

    console.log("Initial contacts response:", initialResponse)

    const totalContacts = initialResponse._total_items || 0
    const fetchedContacts = initialResponse._embedded?.contacts || []

    // Add to our contacts array
    contacts = contacts.concat(fetchedContacts)

    // Update progress
    document.getElementById("progressText").textContent = `Обработка контактов: ${contacts.length}/${totalContacts}`

    // If there are more contacts to fetch
    if (contacts.length < totalContacts) {
      let page = 2

      while (contacts.length < totalContacts) {
        // Rate limiting - wait 1 second between requests
        await new Promise((resolve) => setTimeout(resolve, 1000))

        const response = await makeApiRequest(subdomain, "/api/v4/contacts", accessToken, {
          limit: 2,
          page,
        })

        const pageContacts = response._embedded?.contacts || []
        contacts = contacts.concat(pageContacts)

        // Update progress
        document.getElementById("progressText").textContent = `Обработка контактов: ${contacts.length}/${totalContacts}`

        page++

        // Safety check to prevent infinite loops
        if (pageContacts.length === 0 || page > 100) break
      }
    }

    console.log(`Загружено ${contacts.length} контактов`)
  } catch (error) {
    console.error("Error fetching contacts:", error)
    throw new Error(`Не удалось загрузить контакты: ${error.message}`)
  }
}

// Fetch tasks from amoCRM API with rate limiting
async function fetchTasks(accessToken, subdomain) {
  try {
    document.getElementById("progressText").textContent = "Загрузка задач..."

    // First request to get total count
    const initialResponse = await makeApiRequest(subdomain, "/api/v4/tasks", accessToken, { limit: 2 })

    console.log("Initial tasks response:", initialResponse)

    const totalTasks = initialResponse._total_items || 0
    const fetchedTasks = initialResponse._embedded?.tasks || []

    // Add to our tasks array
    tasks = tasks.concat(fetchedTasks)

    // Update progress
    document.getElementById("progressText").textContent = `Обработка задач: ${tasks.length}/${totalTasks}`

    // If there are more tasks to fetch
    if (tasks.length < totalTasks) {
      let page = 2

      while (tasks.length < totalTasks) {
        // Rate limiting - wait 1 second between requests
        await new Promise((resolve) => setTimeout(resolve, 1000))

        const response = await makeApiRequest(subdomain, "/api/v4/tasks", accessToken, {
          limit: 2,
          page,
        })

        const pageTasks = response._embedded?.tasks || []
        tasks = tasks.concat(pageTasks)

        // Update progress
        document.getElementById("progressText").textContent = `Обработка задач: ${tasks.length}/${totalTasks}`

        page++

        // Safety check to prevent infinite loops
        if (pageTasks.length === 0 || page > 100) break
      }
    }

    console.log(`Загружено ${tasks.length} задач`)
  } catch (error) {
    console.error("Error fetching tasks:", error)
    throw new Error(`Не удалось загрузить задачи: ${error.message}`)
  }
}

// Make API request with local proxy
async function makeApiRequest(subdomain, endpoint, accessToken, params = {}) {
  // Build query string from params
  const queryString = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")

  // Append query string to endpoint if it exists
  const apiPath = queryString ? `${endpoint}?${queryString}` : endpoint

  // Full URL for the API request
  const targetUrl = `https://${subdomain}.amocrm.ru${apiPath}`

  console.log(`Making API request to: ${targetUrl}`)

  try {
    // Use our local proxy
    const proxyUrl = `http://localhost:8080?url=${encodeURIComponent(targetUrl)}`

    const response = await fetch(proxyUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "amoCRM-oAuth-client/1.0",
      },
    })

    // Get response text for logging
    const responseText = await response.text()
    console.log(`API response status: ${response.status}`)
    console.log(`API response text: ${responseText.substring(0, 200)}...`)

    // Check for HTTP errors
    if (!response.ok) {
      // Handle common error codes
      let errorMessage
      switch (response.status) {
        case 400:
          errorMessage = "Неверный запрос"
          break
        case 401:
          errorMessage = "Ошибка авторизации - проверьте ваш токен доступа"
          break
        case 403:
          errorMessage = "Доступ запрещен - недостаточно прав"
          break
        case 404:
          errorMessage = "Ресурс не найден - проверьте URL"
          break
        case 500:
          errorMessage = "Внутренняя ошибка сервера"
          break
        case 502:
          errorMessage = "Ошибка шлюза"
          break
        case 503:
          errorMessage = "Сервис недоступен"
          break
        default:
          errorMessage = `Ошибка HTTP ${response.status}`
      }

      throw new Error(`${errorMessage}: ${responseText}`)
    }

    // Parse JSON response
    let jsonResponse
    try {
      jsonResponse = JSON.parse(responseText)
    } catch (e) {
      throw new Error(`Не удалось разобрать ответ сервера: ${e.message}`)
    }

    return jsonResponse
  } catch (error) {
    console.error("API request error:", error)
    throw error
  }
}

// Render the deals table with contacts
function renderDealsTable() {
  const dealsTableBody = document.getElementById("dealsTableBody")
  dealsTableBody.innerHTML = ""

  deals.forEach((deal) => {
    // Find linked contacts for this deal
    const linkedContacts = findLinkedContacts(deal.id)

    if (linkedContacts.length > 0) {
      // If deal has contacts, create a row for each contact
      linkedContacts.forEach((contact) => {
        const row = createDealRow(deal, contact)
        dealsTableBody.appendChild(row)
      })
    } else {
      // If deal has no contacts, create a row with empty contact info
      const row = createDealRow(deal, null)
      dealsTableBody.appendChild(row)
    }
  })

  // Add event listeners to view buttons
  document.querySelectorAll(".view-deal-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation()
      const dealId = button.getAttribute("data-deal-id")
      openDealDetails(dealId)
    })
  })

  // Add event listeners to table rows
  document.querySelectorAll("tr[data-deal-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const dealId = row.getAttribute("data-deal-id")
      toggleDealDetails(dealId, row)
    })
  })
}

// Create a table row for a deal and contact
function createDealRow(deal, contact) {
  const row = document.createElement("tr")
  row.setAttribute("data-deal-id", deal.id)

  // Deal ID
  const idCell = document.createElement("td")
  idCell.textContent = deal.id
  row.appendChild(idCell)

  // Deal Name
  const nameCell = document.createElement("td")
  nameCell.textContent = deal.name || "Без названия"
  row.appendChild(nameCell)

  // Budget
  const budgetCell = document.createElement("td")
  budgetCell.textContent = deal.price ? `${deal.price} ₽` : "Не указан"
  row.appendChild(budgetCell)

  // Contact Name
  const contactNameCell = document.createElement("td")
  contactNameCell.textContent = contact ? contact.name || "Без имени" : "Нет контакта"
  row.appendChild(contactNameCell)

  // Phone Number
  const phoneCell = document.createElement("td")
  if (contact && contact.custom_fields_values) {
    const phoneField = contact.custom_fields_values.find(
      (field) => field.field_code === "PHONE" || field.field_name === "Телефон",
    )

    if (phoneField && phoneField.values && phoneField.values.length > 0) {
      phoneCell.textContent = phoneField.values[0].value
    } else {
      phoneCell.textContent = "Нет телефона"
    }
  } else {
    phoneCell.textContent = "Нет телефона"
  }
  row.appendChild(phoneCell)

  // Actions
  const actionsCell = document.createElement("td")
  const viewButton = document.createElement("button")
  viewButton.className = "btn btn-sm btn-primary view-deal-btn"
  viewButton.setAttribute("data-deal-id", deal.id)
  viewButton.innerHTML = '<i class="fas fa-eye me-1"></i> Детали'
  actionsCell.appendChild(viewButton)
  row.appendChild(actionsCell)

  return row
}

// Find contacts linked to a specific deal
function findLinkedContacts(dealId) {
  const linkedContacts = []

  contacts.forEach((contact) => {
    if (contact._embedded && contact._embedded.leads) {
      const isLinked = contact._embedded.leads.some((lead) => lead.id === dealId)
      if (isLinked) {
        linkedContacts.push(contact)
      }
    }
  })

  return linkedContacts
}

// Toggle expanded deal details in the table
async function toggleDealDetails(dealId, row) {
  const dealIdInt = Number.parseInt(dealId)

  // If this deal is already expanded, collapse it
  if (expandedDealId === dealIdInt) {
    collapseExpandedRow()
    return
  }

  // Collapse any previously expanded row
  collapseExpandedRow()

  // Set the current deal as expanded
  expandedDealId = dealIdInt

  // Add expanded class to the row
  row.classList.add("expanded-row")

  // Create a new row for expanded content
  const expandedRow = document.createElement("tr")
  expandedRow.id = `expanded-${dealId}`
  expandedRow.className = "expanded-details"

  // Create a cell that spans all columns
  const expandedCell = document.createElement("td")
  expandedCell.colSpan = 6

  // Add loading spinner
  expandedCell.innerHTML = `
      <div class="row-spinner">
          <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Загрузка...</span>
          </div>
      </div>
  `

  expandedRow.appendChild(expandedCell)

  // Insert the expanded row after the clicked row
  row.parentNode.insertBefore(expandedRow, row.nextSibling)

  // Fetch detailed information
  try {
    // Get the deal
    const deal = deals.find((d) => d.id === dealIdInt)

    // Get tasks for this deal
    const dealTasks = tasks.filter((task) => task.entity_id === dealIdInt && task.entity_type === "leads")

    // Sort tasks by complete_till (due date)
    dealTasks.sort((a, b) => a.complete_till - b.complete_till)

    // Get the nearest task
    const nearestTask = dealTasks.length > 0 ? dealTasks[0] : null

    // Format the task status
    const taskStatus = getTaskStatusSVG(nearestTask)

    // Format the date
    const createdDate = new Date(deal.created_at * 1000)
    const formattedDate = `${padZero(createdDate.getDate())}.${padZero(createdDate.getMonth() + 1)}.${createdDate.getFullYear()}`

    // Update the expanded content
    expandedCell.innerHTML = `
          <div class="expanded-content">
              <div class="row">
                  <div class="col-md-6">
                      <div class="deal-detail-card">
                          <h5>${deal.name || "Без названия"}</h5>
                          <p><span class="detail-label">ID:</span> ${deal.id}</p>
                          <p><span class="detail-label">Дата создания:</span> ${formattedDate}</p>
                          <p><span class="detail-label">Бюджет:</span> ${deal.price ? `${deal.price} ₽` : "Не указан"}</p>
                      </div>
                  </div>
                  <div class="col-md-6">
                      <div class="deal-detail-card">
                          <h5>Статус задачи</h5>
                          <div class="d-flex align-items-center mb-2">
                              ${taskStatus}
                              <span>${nearestTask ? formatTaskDueDate(nearestTask.complete_till) : "Нет задач"}</span>
                          </div>
                          <p><span class="detail-label">Текст задачи:</span> ${nearestTask ? nearestTask.text : "Н/Д"}</p>
                      </div>
                  </div>
              </div>
          </div>
      `
  } catch (error) {
    console.error("Error loading deal details:", error)
    expandedCell.innerHTML = `
          <div class="expanded-content">
              <div class="alert alert-danger">
                  Ошибка загрузки деталей сделки: ${error.message}
              </div>
          </div>
      `
  }
}

// Collapse the currently expanded row
function collapseExpandedRow() {
  if (expandedDealId !== null) {
    // Remove expanded class from the deal row
    const dealRow = document.querySelector(`tr[data-deal-id="${expandedDealId}"]`)
    if (dealRow) {
      dealRow.classList.remove("expanded-row")
    }

    // Remove the expanded content row
    const expandedRow = document.getElementById(`expanded-${expandedDealId}`)
    if (expandedRow) {
      expandedRow.remove()
    }

    expandedDealId = null
  }
}

// Open deal details in modal
function openDealDetails(dealId) {
  const dealIdInt = Number.parseInt(dealId)
  const deal = deals.find((d) => d.id === dealIdInt)

  if (!deal) {
    console.error(`Deal with ID ${dealId} not found`)
    return
  }

  // Get the modal content element
  const modalContent = document.getElementById("dealDetailsContent")

  // Show loading spinner
  modalContent.innerHTML = `
      <div class="text-center">
          <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Загрузка...</span>
          </div>
          <p class="mt-2">Загрузка деталей сделки...</p>
      </div>
  `

  // Show the modal
  dealDetailsModal.show()

  // Get tasks for this deal
  const dealTasks = tasks.filter((task) => task.entity_id === dealIdInt && task.entity_type === "leads")

  // Sort tasks by complete_till (due date)
  dealTasks.sort((a, b) => a.complete_till - b.complete_till)

  // Get the nearest task
  const nearestTask = dealTasks.length > 0 ? dealTasks[0] : null

  // Format the task status
  const taskStatus = getTaskStatusSVG(nearestTask)

  // Format the date
  const createdDate = new Date(deal.created_at * 1000)
  const formattedDate = `${padZero(createdDate.getDate())}.${padZero(createdDate.getMonth() + 1)}.${createdDate.getFullYear()}`

  // Find linked contacts
  const linkedContacts = findLinkedContacts(dealIdInt)

  // Build task list HTML
  let tasksHTML = ""
  if (dealTasks.length > 0) {
    tasksHTML = `
      <div class="deal-detail-card">
        <h5><i class="fas fa-tasks me-2"></i>Связанные задачи</h5>
        <div class="list-group">
          ${dealTasks
            .map((task) => {
              const taskStatusSVG = getTaskStatusSVG(task)
              return `
              <div class="list-group-item">
                <div class="d-flex w-100 justify-content-between align-items-center">
                  <div class="d-flex align-items-center">
                    ${taskStatusSVG}
                    <span class="ms-2">${task.text || "Без описания"}</span>
                  </div>
                  <small>Срок: ${formatTaskDueDate(task.complete_till)}</small>
                </div>
              </div>
            `
            })
            .join("")}
        </div>
      </div>
    `
  } else {
    tasksHTML = `
      <div class="alert alert-info">
        <i class="fas fa-info-circle me-2"></i>
        Нет задач, связанных с этой сделкой.
      </div>
    `
  }

  // Build contacts HTML
  let contactsHTML = ""
  if (linkedContacts.length > 0) {
    contactsHTML = `
          <div class="deal-detail-card">
              <h5><i class="fas fa-users me-2"></i>Связанные контакты</h5>
              <div class="list-group">
                  ${linkedContacts
                    .map((contact) => {
                      let phone = "Нет телефона"
                      if (contact.custom_fields_values) {
                        const phoneField = contact.custom_fields_values.find(
                          (field) => field.field_code === "PHONE" || field.field_name === "Телефон",
                        )

                        if (phoneField && phoneField.values && phoneField.values.length > 0) {
                          phone = phoneField.values[0].value
                        }
                      }

                      return `
                          <div class="list-group-item">
                              <div class="d-flex w-100 justify-content-between">
                                  <h6 class="mb-1">${contact.name || "Без имени"}</h6>
                                  <small>ID: ${contact.id}</small>
                              </div>
                              <p class="mb-1"><i class="fas fa-phone me-2"></i>${phone}</p>
                          </div>
                      `
                    })
                    .join("")}
              </div>
          </div>
      `
  } else {
    contactsHTML = `
          <div class="alert alert-info">
              <i class="fas fa-info-circle me-2"></i>
              Нет контактов, связанных с этой сделкой.
          </div>
      `
  }

  // Update modal content
  modalContent.innerHTML = `
      <div class="deal-detail-card">
          <div class="d-flex justify-content-between align-items-center mb-3">
              <h4>${deal.name || "Без названия"}</h4>
              <span class="badge bg-primary">ID: ${deal.id}</span>
          </div>
          <div class="row">
              <div class="col-md-6">
                  <p><i class="fas fa-calendar me-2"></i><span class="detail-label">Дата создания:</span> ${formattedDate}</p>
              </div>
              <div class="col-md-6">
                  <p><i class="fas fa-money-bill-wave me-2"></i><span class="detail-label">Бюджет:</span> ${deal.price ? `${deal.price} ₽` : "Не указан"}</p>
              </div>
          </div>
      </div>
      
      <div class="deal-detail-card">
          <h5><i class="fas fa-tasks me-2"></i>Статус задачи</h5>
          <div class="d-flex align-items-center mb-2">
              ${taskStatus}
              <span class="ms-2 fw-bold">${nearestTask ? formatTaskDueDate(nearestTask.complete_till) : "Нет задач"}</span>
          </div>
          <p><span class="detail-label">Текст задачи:</span> ${nearestTask ? nearestTask.text : "Н/Д"}</p>
      </div>
      
      ${tasksHTML}
      ${contactsHTML}
  `
}

// Get task status SVG with colored circle
function getTaskStatusSVG(task) {
  if (!task) {
    return `<svg class="task-status-svg" viewBox="0 0 12 12">
            <circle class="task-circle" fill="#dc3545" />
        </svg>
        <span class="task-status-text"></span>`
  }

  const now = Math.floor(Date.now() / 1000)
  const yesterday = now - 86400 // 24 hours in seconds
  const tomorrow = now + 86400

  let color
  let statusText

  if (task.complete_till < yesterday) {
    // Task is overdue (yesterday or earlier)
    color = "#dc3545" // Red
    statusText = "Просрочена"
  } else if (task.complete_till <= tomorrow) {
    // Task is due today
    color = "#28a745" // Green
    statusText = "Сегодня"
  } else {
    // Task is due in the future
    color = "#ffc107" // Yellow
    statusText = "Будущая"
  }

  return `
      <div class="d-flex align-items-center">
          <svg class="task-status-svg" viewBox="0 0 12 12">
              <circle class="task-circle" fill="${color}" />
          </svg>
          <span class="task-status-text">${statusText}</span>
      </div>
  `
}

// Format task due date
function formatTaskDueDate(timestamp) {
  const date = new Date(timestamp * 1000)
  return `${padZero(date.getDate())}.${padZero(date.getMonth() + 1)}.${date.getFullYear()}`
}

// Pad a number with leading zero if needed
function padZero(num) {
  return num < 10 ? `0${num}` : num
}

// UI Helper Functions
function showLoading() {
  document.getElementById("loadingIndicator").classList.remove("d-none")
}

function hideLoading() {
  document.getElementById("loadingIndicator").classList.add("d-none")
}

function showError(message) {
  const errorElement = document.getElementById("errorMessage")
  errorElement.classList.remove("alert-success")
  errorElement.classList.add("alert-danger")
  document.getElementById("errorText").textContent = message
  errorElement.classList.remove("d-none")
}

function hideError() {
  document.getElementById("errorMessage").classList.add("d-none")
}

function showDealsTable() {
  document.getElementById("dealsTableContainer").classList.remove("d-none")
}

function hideDealsTable() {
  document.getElementById("dealsTableContainer").classList.add("d-none")
}

function showNoDealsMessage() {
  document.getElementById("noDealsMessage").classList.remove("d-none")
}

function hideNoDealsMessage() {
  document.getElementById("noDealsMessage").classList.add("d-none")
}

