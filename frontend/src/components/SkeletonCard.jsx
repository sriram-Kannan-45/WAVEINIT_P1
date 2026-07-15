import React from 'react'

function SkeletonCard({ variant = 'card', count = 1 }) {
  const renderSkeleton = () => {
    switch (variant) {
      case 'training':
        return (
          <div className="bg-white p-4 rounded-lg shadow-md animate-pulse">
            <div className="h-6 bg-gray-200 rounded mb-4 w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded mb-3 w-full"></div>
            <div className="h-4 bg-gray-200 rounded mb-4 w-5/6"></div>
            <div className="flex gap-2">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            </div>
          </div>
        )
      case 'enrollment':
        return (
          <div className="bg-white p-4 rounded-lg shadow-md animate-pulse">
            <div className="flex justify-between">
              <div className="flex-1">
                <div className="h-5 bg-gray-200 rounded mb-2 w-2/3"></div>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
              </div>
              <div className="h-6 bg-gray-200 rounded w-20"></div>
            </div>
          </div>
        )
      case 'feedback':
        return (
          <div className="bg-white p-4 rounded-lg shadow-md animate-pulse">
            <div className="h-5 bg-gray-200 rounded mb-3 w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded mb-2 w-full"></div>
            <div className="h-4 bg-gray-200 rounded mb-4 w-3/4"></div>
            <div className="flex gap-2">
              <div className="h-4 bg-gray-200 rounded w-20"></div>
              <div className="h-4 bg-gray-200 rounded w-20"></div>
            </div>
          </div>
        )
      default:
        return (
          <div className="bg-white p-4 rounded-lg shadow-md animate-pulse">
            <div className="h-6 bg-gray-200 rounded mb-4 w-full"></div>
            <div className="h-4 bg-gray-200 rounded mb-3 w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        )
    }
  }

  return (
    <div className="space-y-3">
      {Array(count).fill(0).map((_, i) => (
        <div key={i}>{renderSkeleton()}</div>
      ))}
    </div>
  )
}

export default SkeletonCard
