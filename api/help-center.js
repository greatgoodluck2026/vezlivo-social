export default function handler(req, res) {
  const helpTopics = [
    {
      title: "Getting started",
      questions: [
        {
          question: "What is Vezlivo?",
          answer:
            "Vezlivo is a social platform where you can watch, share and discover videos."
        },
        {
          question: "Do I need an account to watch videos?",
          answer:
            "No. You can watch public videos without signing in. You need an account for features such as posting, liking, commenting and following."
        }
      ]
    },

    {
      title: "Accounts",
      questions: [
        {
          question: "How do I create an account?",
          answer:
            "Open Vezlivo and choose the option to create an account. Follow the instructions to complete registration."
        },
        {
          question: "Can I change my username?",
          answer:
            "Yes. Username changes are subject to Vezlivo's account rules and change limits."
        }
      ]
    },

    {
      title: "Videos and posts",
      questions: [
        {
          question: "How do I post a video?",
          answer:
            "Open the Create Post section, choose your video, add a caption if you want, and submit the post."
        },
        {
          question: "Why can't I upload my video?",
          answer:
            "Check your internet connection, make sure the video is supported, and make sure your account has permission to post."
        },
        {
          question: "Can I delete my post?",
          answer:
            "Yes. You can manage your own posts from your account and remove a post when the option is available."
        }
      ]
    },

    {
      title: "Likes, comments and follows",
      questions: [
        {
          question: "How do I like a video?",
          answer:
            "Tap the like button on a video while signed in."
        },
        {
          question: "How do I comment?",
          answer:
            "Open the comments section of a video and enter your comment."
        },
        {
          question: "How do I follow someone?",
          answer:
            "Open the person's profile and select Follow."
        }
      ]
    },

    {
      title: "Safety and reporting",
      questions: [
        {
          question: "How do I report something?",
          answer:
            "Use the report option available on the relevant content or account and select the reason that best describes the problem."
        },
        {
          question: "Can I block another user?",
          answer:
            "Yes. You can block users through the available account controls."
        },
        {
          question: "What happens when content breaks the rules?",
          answer:
            "Vezlivo may remove content or restrict an account when our safety rules are violated."
        }
      ]
    },

    {
      title: "Privacy and account settings",
      questions: [
        {
          question: "Can I make my account private?",
          answer:
            "Yes, when the private-account option is available in your account settings."
        },
        {
          question: "Can I delete my account?",
          answer:
            "Account deletion can be requested through the account settings."
        }
      ]
    }
  ];

  return res.status(200).json({
    success: true,
    app: "Vezlivo",
    topics: helpTopics
  });
}