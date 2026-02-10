const companies = [
  { name: "Microsoft", logo: "/logos/64px-Microsoft_logo.svg.png" },
  { name: "Amazon", logo: "/logos/64px-Amazon_logo.svg.png" },
  { name: "Apple", logo: "/logos/64px-Apple_logo_black.svg.png" },
  { name: "Netflix", logo: "/logos/64px-Netflix_2015_logo.svg.png" },
  { name: "Stripe", logo: "/logos/64px-Stripe_logo_revised_2016.svg.png" },
  { name: "Shopify", logo: "/logos/64px-Shopify_logo_2018.svg.png" },
  { name: "LinkedIn", logo: "/logos/64px-LinkedIn_icon.svg.png" },
  { name: "Salesforce", logo: "/logos/64px-Salesforce.com_logo.svg.png" },
  { name: "Uber", logo: "/logos/64px-Uber_logo_2018.svg.png" },
  { name: "Airbnb", logo: "/logos/64px-Airbnb_Logo_Bélo.svg.png" },
  { name: "Adobe", logo: "/logos/adobe.svg.png" },
];


const LogoItem = ({ name, logo }) => (
  <div className="mx-6 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity duration-300">
    <img
      src={logo}
      alt={name}
      className="h-8 md:h-9 w-auto object-contain grayscale hover:grayscale-0 transition-all duration-300"
      loading="lazy"
    />
  </div>
);

export default function CompanyLogos() {
  return (
    <section className="py-16 px-4 border-y border-white/5 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <p className="text-sm text-white/50 uppercase tracking-wider font-semibold">
            Trusted by job seekers at
          </p>
        </motion.div>

        <div className="relative">
          <div className="flex animate-scroll items-center">
            {[...companies, ...companies].map((company, i) => (
              <LogoItem key={i} {...company} />
            ))}
          </div>

          {/* edge fades */}
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[hsl(240,10%,4%)] to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[hsl(240,10%,4%)] to-transparent pointer-events-none" />
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  );
}
