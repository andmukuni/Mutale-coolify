import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { UserAuthProvider } from './context/UserAuthContext'
import { DataProvider } from './context/DataContext'
import { BookingProvider } from './context/BookingContext'
import { BookStoreProvider } from './context/BookStoreContext'
import { CurrencyProvider } from './context/CurrencyContext'
import { ProductTypesProvider } from './context/ProductTypesContext'
import { ProductCategoriesProvider } from './context/ProductCategoriesContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import './index.css'
import './styles/blog-content.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <UserAuthProvider>
            <CurrencyProvider>
              <DataProvider>
                <ProductTypesProvider>
                  <ProductCategoriesProvider>
                  <BookingProvider>
                    <BookStoreProvider>
                      <App />
                    </BookStoreProvider>
                  </BookingProvider>
                  </ProductCategoriesProvider>
                </ProductTypesProvider>
              </DataProvider>
            </CurrencyProvider>
          </UserAuthProvider>
        </AuthProvider>
      </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
