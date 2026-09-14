export const moduleResources = {
  tasks: {
    title: "Tasks",
    endpoint: "tasks",
    defaultPayload: {
      name: "",
      due_date: "",
      description: "",
      assigned_to: "",
      status: "running"
    }
  },
  customers: {
    title: "Customers",
    endpoint: "customers",
    defaultPayload: {
      first_name: "John",
      last_name: "Doe",
      email: "john@example.com",
      mobile: "9999999999",
      address: "City Center",
      customer_type: "regular",
      gender: "male",
      status: true
    }
  },
  groups: {
    title: "Customer Groups",
    endpoint: "groups",
    defaultPayload: {
      name: "Group A",
      cid: "CID-001",
      price: "0",
      description: "Default group",
      status: true
    }
  },
  bookings: {
    title: "Bookings",
    endpoint: "bookings",
    defaultPayload: {
      customer_id: 1,
      room_no: "A-101",
      check_in: "2026-03-24",
      check_out: "2026-03-26",
      status: "confirmed"
    }
  },
  staff: {
    title: "Staff",
    endpoint: "staff",
    defaultPayload: {
      name: "Staff User",
      email: "staff@example.com",
      phone: "8888888888",
      role: "manager",
      status: true,
      join_date: "2026-03-24"
    }
  },
  stocks: {
    title: "Stocks",
    endpoint: "stocks",
    defaultPayload: {
      name: "Room Linen",
      category: "housekeeping",
      quantity: 20,
      unit_price: "250",
      status: true
    }
  },
  tickets: {
    title: "Tickets",
    endpoint: "tickets",
    defaultPayload: {
      title: "Customer Query",
      description: "Customer asked for late checkout",
      priority: "medium",
      status: "open"
    }
  },
  invoices: {
    title: "Invoices",
    endpoint: "invoices",
    defaultPayload: {
      customer_id: 1,
      invoice_no: "INV-1001",
      amount: "1200",
      due_date: "2026-03-31",
      status: "unpaid"
    }
  },
  payments: {
    title: "Payments",
    endpoint: "payments",
    defaultPayload: {
      invoice_id: 1,
      method: "cash",
      amount: "1200",
      paid_on: "2026-03-24",
      status: "success"
    }
  },
  expenses: {
    title: "Expenses",
    endpoint: "expenses",
    defaultPayload: {
      title: "Electricity",
      category: "utility",
      amount: "450",
      expense_date: "2026-03-24",
      notes: "Monthly bill",
      status: true
    }
  },
  expenseCategories: {
    title: "Expense Categories",
    endpoint: "expense-categories", // No '/web' prefix, matches backend
    defaultPayload: {
      name: "Travel",
      status: true
    }
  },
  attendance: {
    title: "Attendance",
    endpoint: "attendance",
    defaultPayload: {
      staff_id: 1,
      attendance_date: "2026-03-24",
      check_in: "09:00",
      check_out: "18:00",
      status: "present"
    }
  },
  payroll: {
    title: "Payroll",
    endpoint: "payroll",
    defaultPayload: {
      staff_id: 1,
      month: "2026-03",
      basic_salary: "10000",
      bonus: "1000",
      deduction: "500",
      net_salary: "10500",
      status: "pending"
    }
  },
  jobs: {
    title: "Jobs",
    endpoint: "jobs",
    defaultPayload: {
      title: "Front Desk Executive",
      department: "operations",
      location: "Ahmedabad",
      description: "Front desk and customer handling",
      status: "open"
    }
  },
  companies: {
    title: "Companies",
    endpoint: "companies",
    defaultPayload: {
      name: "",
      email: "",
      phone: "",
      address: "",
      status: true
    }
  },
  departments: {
    title: "Departments",
    endpoint: "departments",
    defaultPayload: {
      name: "Operations",
      status: true
    }
  },
  items: {
    title: "Items",
    endpoint: "items",
    defaultPayload: {
      name: "Welcome Kit",
      sku: "KIT-001",
      price: "120",
      status: true
    }
  },
  documents: {
    title: "Documents",
    endpoint: "documents",
    defaultPayload: {
      title: "Policy",
      description: "Customer policy document",
      file_url: "https://example.com/policy.pdf",
      status: true
    }
  },
  training: {
    title: "Training",
    endpoint: "training",
    defaultPayload: {
      topic: "Hospitality Basics",
      trainer: "Admin",
      date: "2026-03-24",
      status: "scheduled"
    }
  },
  notices: {
    title: "Notices",
    endpoint: "notices",
    defaultPayload: {
      title: "Holiday Notice",
      body: "Office closed on Sunday",
      status: true
    }
  },
  messages: {
    title: "Messages",
    endpoint: "messages",
    defaultPayload: {
      subject: "Reminder",
      body: "Complete your profile",
      recipient: "staff@example.com",
      status: "sent"
    }
  },
  notes: {
    title: "Notes",
    endpoint: "notes",
    defaultPayload: {
      title: "Daily Note",
      content: "Team meeting at 10 AM",
      status: true
    }
  },
  settings: {
    title: "Settings",
    endpoint: "settings",
    defaultPayload: {
      key: "currency",
      value: "INR",
      group: "general"
    }
  },
  taxrates: {
    title: "Tax Rates",
    endpoint: "taxrates",
    defaultPayload: {
      date: "2026-03-25",
      account: "",
      type: "",
      category: "",
      amount: "",
      description: "",
      credit: "",
      balance: ""
    }
  }
}
