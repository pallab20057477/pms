import React from 'react'
import './FooterModern.css'

function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="main-footer modern-footer">
      <div className="modern-footer-content">
        <span>&copy; {currentYear} <strong>Mitra Infotech</strong>. All rights reserved.</span>
        <div className="modern-footer-links">
          <a href="https://www.mitrainfotech.com/" target="_blank" rel="noreferrer">
            <i className="fa-solid fa-globe"></i> www.mitrainfotech.com
          </a>
        </div>
      </div>
    </footer>
  )
}
export default Footer
