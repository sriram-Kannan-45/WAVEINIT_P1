export default function AuthButton({ children, type = 'submit', disabled = false }) {
  return (
    <button
      type={type}
      className="auth-submit-btn"
      disabled={disabled}
    >
      {children}
    </button>
  );
}
