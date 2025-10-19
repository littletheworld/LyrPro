
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'export';
  icon?: React.ReactNode;
  size?: 'normal' | 'small';
}

const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', icon, size = 'normal', ...props }) => {
  const baseClasses = "flex items-center justify-center gap-2.5 rounded-xl font-semibold shadow-sm transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none";
  
  const sizeClasses = {
    normal: "px-6 py-3 text-base",
    small: "px-4 py-2 text-sm",
  };

  const variantClasses = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
    secondary: "bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-400",
    export: "bg-green-500 text-white hover:bg-green-600 focus:ring-green-400",
  };

  return (
    <button className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]}`} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  );
};

export default Button;