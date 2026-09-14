function dash() {
    // single bar chart
    var ctx = document.getElementById("singelBarChart");
    var myChart = new Chart(ctx, {
    type: 'bar',
    data: {
    labels: ["Sun", "Mon", "Tu", "Wed", "Th", "Fri", "Sat"],
    datasets: [
    {
    label: "My First dataset",
    data: [40, 55, 75, 81, 56, 55, 40],
    borderColor: "rgba(0, 150, 136, 0.8)",
    width: "1",
    borderWidth: "0",
    backgroundColor: "rgba(0, 150, 136, 0.8)"
    }
    ]
    },
    options: {
    scales: {
    yAxes: [{
        ticks: {
            beginAtZero: true
        }
    }]
    }
    }
    });
        //monthly calender
        $('#m_calendar').monthly({
            mode: 'event',
            //jsonUrl: 'events.json',
            //dataType: 'json'
            xmlUrl: 'events.xml'
        });
    
    //bar chart
    var ctx = document.getElementById("barChart");
    var myChart = new Chart(ctx, {
    type: 'bar',
    data: {
    labels: ["January", "February", "March", "April", "May", "June", "July", "august", "september","october", "Nobemver", "December"],
    datasets: [
    {
    label: "My First dataset",
    data: [65, 59, 80, 81, 56, 55, 40, 65, 59, 80, 81, 56],
    borderColor: "rgba(0, 150, 136, 0.8)",
    width: "1",
    borderWidth: "0",
    backgroundColor: "rgba(0, 150, 136, 0.8)"
    },
    {
    label: "My Second dataset",
    data: [28, 48, 40, 19, 86, 27, 90, 28, 48, 40, 19, 86],
    borderColor: "rgba(51, 51, 51, 0.55)",
    width: "1",
    borderWidth: "0",
    backgroundColor: "rgba(51, 51, 51, 0.55)"
    }
    ]
    },
    options: {
    scales: {
    yAxes: [{
        ticks: {
            beginAtZero: true
        }
    }]
    }
    }
    });
        //counter
        $('.count-number').counterUp({
            delay: 10,
            time: 5000
        });
    }
    dash(); 