import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

function AnimatedDropdown({
  value,
  onChange,
  options,
  placeholder = "Select...",
  label,
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="animated-dropdown-wrapper" ref={dropdownRef}>
      {label && <label className="form-label">{label}</label>}
      <div className={`animated-dropdown ${isOpen ? "open" : ""} ${className}`}>
        <button
          type="button"
          className="animated-dropdown-trigger"
          onClick={() => setIsOpen(!isOpen)}
          style={{ width: "100%" }}
        >
          <span className={selectedOption ? "" : "placeholder"}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <motion.span
            className="dropdown-chevron"
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            ▾
          </motion.span>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              className="animated-dropdown-menu"
              initial={{ opacity: 0, y: -8, scaleY: 0.96 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              exit={{ opacity: 0, y: -4, scaleY: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`animated-dropdown-item ${option.value === value ? "active" : ""}`}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  {option.label}
                  {option.value === value && (
                    <span className="check-icon">✓</span>
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default AnimatedDropdown;
