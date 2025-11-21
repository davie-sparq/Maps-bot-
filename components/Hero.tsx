import React from 'react';

const Hero: React.FC = () => {
    return (
        <div className="relative overflow-hidden rounded-3xl bg-indigo-900 text-white mb-12 shadow-2xl shadow-indigo-900/20">
            <div className="absolute inset-0">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-purple-700 opacity-90"></div>
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-white opacity-10 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-500 opacity-20 rounded-full blur-3xl"></div>
            </div>

            <div className="relative z-10 px-8 py-16 md:py-24 text-center max-w-4xl mx-auto">
                <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
                    Discover the Best Businesses in <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-300">Kenya</span>
                </h2>
                <p className="text-lg md:text-xl text-indigo-100 mb-10 max-w-2xl mx-auto leading-relaxed">
                    Find trusted local services, shops, and professionals near you.
                    Explore ratings, reviews, and connect instantly.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <button className="px-8 py-4 bg-white text-indigo-600 font-bold rounded-xl shadow-lg hover:bg-indigo-50 hover:scale-105 transition-all duration-300 w-full sm:w-auto">
                        Get Started
                    </button>
                    <button className="px-8 py-4 bg-indigo-800/50 text-white border border-indigo-400/30 font-semibold rounded-xl hover:bg-indigo-800/70 transition-all duration-300 w-full sm:w-auto backdrop-blur-sm">
                        Learn More
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Hero;
